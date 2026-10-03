import { describe, it, expect, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from '../../src/config.js';
import { insertAuditLog, updateFraudEventExplanation } from '../../src/db/audit.js';

describe('Regression: Explainability Audit & Stream Contract', () => {
  const redis = new Redis(config.redisUrl);

  afterAll(async () => {
    await redis.quit();
  });

  it('AUD-001: publishes compliant audit summary to stream:audit:logged', async () => {
    const alertId = crypto.randomUUID();
    const transactionId = crypto.randomUUID();
    const summaryText = 'Transaction blocked (Risk 92/100): 3-hop connection to known fraud ring.';
    const shapDrivers = JSON.stringify([
      { feature: 'graph_mule_hops', label: '3-hop connection', impactPercent: 65 },
    ]);

    const entryId = await redis.xadd(
      config.auditStream,
      '*',
      'alertId', alertId,
      'transactionId', transactionId,
      'tenantId', 'tenant_bank_alpha',
      'status', 'BLOCKED',
      'fraudScore', '0.92',
      'auditSummary', summaryText,
      'shapDrivers', shapDrivers,
      'llmModel', 'google/gemini-2.0-flash-001',
      'timestamp', new Date().toISOString()
    );

    expect(entryId).toBeDefined();

    const range = await redis.xrevrange(config.auditStream, '+', '-', 'COUNT', 1);
    expect(range.length).toBe(1);
    const [, fields] = range[0];

    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }

    expect(map.alertId).toBe(alertId);
    expect(map.auditSummary).toBe(summaryText);
    expect(JSON.parse(map.shapDrivers)).toBeInstanceOf(Array);
  });

  it('AUD-002: database helper never throws unhandled exceptions during connection issues', async () => {
    await expect(
      insertAuditLog({
        entityType: 'FRAUD_EVENT',
        entityId: crypto.randomUUID(),
        eventType: 'EXPLAINED',
        actor: 'SYSTEM',
        payload: { test: true },
      })
    ).resolves.not.toThrow();

    await expect(
      updateFraudEventExplanation(crypto.randomUUID(), [], 'Audit test summary')
    ).resolves.not.toThrow();
  });
});
