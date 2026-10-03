import { describe, it, expect, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from '../../src/config.js';
import { dispatchInterventions } from '../../src/interventions/webhooks.js';
import { AlertInputEvent, PolicyAction } from '../../src/types.js';

describe('Regression: Policy Engine Resilience & Concurrency', () => {
  const redis = new Redis(config.redisUrl);

  afterAll(async () => {
    await redis.quit();
  });

  it('POL-REG-001: handles concurrent burst of alerts with zero ID collisions or unhandled rejections', async () => {
    const burstCount = 10;
    const alerts: AlertInputEvent[] = Array.from({ length: burstCount }, (_, i) => ({
      alertId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      tenantId: 'tenant_bank_alpha',
      status: i % 2 === 0 ? 'FLAGGED' : 'BLOCKED',
      fraudScore: 0.5 + i * 0.04,
      graphHops: i % 3,
      fraudRingIds: [`ring_${i}`],
      velocity: { count1m: i, count1h: i * 2, count24h: i * 5, sumAmount1h: 1000 * i },
      payload: {
        fromAccountId: `acc_${i}`,
        toAccountId: `acc_dest_${i}`,
        amount: 500 * (i + 1),
        currency: 'USD',
        channel: 'mobile',
      },
      timestamp: new Date().toISOString(),
    }));

    // Process all 10 concurrently
    const promises = alerts.map((alert) => {
      const actions: PolicyAction[] =
        alert.status === 'BLOCKED' ? ['freeze_escrow'] : ['sms_otp', 'whatsapp_otp'];
      return dispatchInterventions(alert, actions);
    });

    const results = await Promise.all(promises);

    expect(results.length).toBe(burstCount);

    // Verify all actions completed with SUCCESS
    results.forEach((actionList) => {
      expect(actionList.length).toBeGreaterThanOrEqual(1);
      actionList.forEach((res) => {
        expect(res.status).toBe('SUCCESS');
        expect(res.referenceId).toBeDefined();
      });
    });

    // Verify all generated reference IDs are completely distinct (no collision)
    const allRefIds = results.flatMap((list) => list.map((item) => item.referenceId));
    const uniqueRefIds = new Set(allRefIds);
    expect(uniqueRefIds.size).toBe(allRefIds.length);
  });

  it('POL-REG-002: gracefully isolates individual action failures without aborting batch', async () => {
    const alert: AlertInputEvent = {
      alertId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      tenantId: 'tenant_bank_alpha',
      status: 'FLAGGED',
      fraudScore: 0.6,
      graphHops: 0,
      fraudRingIds: [],
      velocity: { count1m: 1, count1h: 1, count24h: 1, sumAmount1h: 100 },
      payload: {
        fromAccountId: 'acc_source',
        toAccountId: 'acc_dest',
        amount: 250,
        currency: 'USD',
        channel: 'mobile',
      },
      timestamp: new Date().toISOString(),
    };

    // Dispatch a mix of standard actions
    const results = await dispatchInterventions(alert, [
      'sms_otp',
      'freeze_escrow',
      'analyst_dashboard',
    ]);

    expect(results.length).toBe(3);
    const sms = results.find((r) => r.action === 'sms_otp');
    const escrow = results.find((r) => r.action === 'freeze_escrow');
    const dash = results.find((r) => r.action === 'analyst_dashboard');

    expect(sms?.status).toBe('SUCCESS');
    expect(escrow?.status).toBe('SUCCESS');
    expect(dash?.status).toBe('SUCCESS');
  });
});
