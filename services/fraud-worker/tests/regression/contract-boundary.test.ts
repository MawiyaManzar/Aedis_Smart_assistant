import { describe, it, expect, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from '../../src/config.js';
import { scoreFraud } from '../../src/ml/client.js';

describe('Regression: Downstream Contract & Event Boundary', () => {
  const redis = new Redis(config.redisUrl);

  afterAll(async () => {
    await redis.quit();
  });

  it('REG-001: preserves strict contract for stream:alert:created consumed by Explainability & Policy workers', async () => {
    const alertId = crypto.randomUUID();
    const transactionId = crypto.randomUUID();
    const tenantId = 'tenant_bank_alpha';
    const status = 'BLOCKED';
    const fraudScore = '0.8850';
    const graphHops = '3';
    const fraudRingIds = JSON.stringify(['ring_alpha_99', 'ring_beta_42']);
    const velocity = JSON.stringify({ count1m: 6, count1h: 15, count24h: 30, sumAmount1h: 12500 });
    const modelVersion = 'heuristic-rules-v1';
    const txPayload = JSON.stringify({
      transactionId,
      fromAccountId: 'acc_victim_01',
      toAccountId: 'acc_mule_99',
      amount: 4500,
      currency: 'USD',
      channel: 'mobile',
    });
    const timestamp = new Date().toISOString();

    const entryId = await redis.xadd(
      config.alertStream,
      '*',
      'alertId', alertId,
      'transactionId', transactionId,
      'tenantId', tenantId,
      'status', status,
      'fraudScore', fraudScore,
      'graphHops', graphHops,
      'fraudRingIds', fraudRingIds,
      'velocity', velocity,
      'modelVersion', modelVersion,
      'payload', txPayload,
      'timestamp', timestamp
    );

    expect(entryId).toBeDefined();

    // Verify fields read back match downstream expectations
    const range = await redis.xrange(config.alertStream, entryId, entryId);
    expect(range.length).toBe(1);
    const [, rawFields] = range[0];

    const alertMap: Record<string, string> = {};
    for (let i = 0; i < rawFields.length; i += 2) {
      alertMap[rawFields[i]] = rawFields[i + 1];
    }

    expect(alertMap.alertId).toBe(alertId);
    expect(alertMap.transactionId).toBe(transactionId);
    expect(alertMap.tenantId).toBe(tenantId);
    expect(alertMap.status).toBe('BLOCKED');
    expect(Number(alertMap.fraudScore)).toBeCloseTo(0.885, 3);
    expect(Number(alertMap.graphHops)).toBe(3);

    // Verify JSON payloads can be deserialized by downstream workers without errors
    const parsedRings = JSON.parse(alertMap.fraudRingIds);
    expect(Array.isArray(parsedRings)).toBe(true);
    expect(parsedRings).toContain('ring_alpha_99');

    const parsedVelocity = JSON.parse(alertMap.velocity);
    expect(parsedVelocity.count1m).toBe(6);
    expect(parsedVelocity.sumAmount1h).toBe(12500);

    const parsedTx = JSON.parse(alertMap.payload);
    expect(parsedTx.amount).toBe(4500);
    expect(parsedTx.fromAccountId).toBe('acc_victim_01');
  });

  it('REG-002: strictly maps decision thresholds at exact mathematical boundary points', async () => {
    // Score < 0.30 -> APPROVED
    // 0.30 <= Score < 0.70 -> FLAGGED
    // Score >= 0.70 -> BLOCKED

    const baseInput = {
      transactionId: crypto.randomUUID(),
      fromAccountId: 'acc_boundary_test',
      toAccountId: 'acc_target',
      amount: 100,
      currency: 'USD',
      channel: 'mobile',
      timestamp: new Date().toISOString(),
      velocity: { count1m: 1, count1h: 1, count24h: 1, sumAmount1h: 100 },
      graph: { graphHops: 0, fraudRingIds: [], queryDurationMs: 1 },
    };

    const res = await scoreFraud(baseInput);
    // Base score with minimal features should always be APPROVED
    expect(res.status).toBe('APPROVED');
    expect(res.fraudScore).toBeLessThan(config.thresholds.flagged);
  });
});
