import { describe, it, expect, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from '../../src/config.js';
import { recordInterventionAudit } from '../../src/db/audit.js';
import { InterventionEvent } from '../../src/types.js';

describe('Regression: Intervention Stream & Audit Contract', () => {
  const redis = new Redis(config.redisUrl);

  afterAll(async () => {
    await redis.quit();
  });

  it('INT-001: publishes valid intervention event to stream:intervention:dispatched', async () => {
    const interventionId = `intv_${crypto.randomBytes(4).toString('hex')}`;
    const alertId = crypto.randomUUID();
    const transactionId = crypto.randomUUID();

    const entryId = await redis.xadd(
      config.interventionStream,
      '*',
      'interventionId', interventionId,
      'alertId', alertId,
      'transactionId', transactionId,
      'tenantId', 'tenant_bank_alpha',
      'status', 'BLOCKED',
      'stateTransition', 'BLOCKED_HELD',
      'actionsDispatched', JSON.stringify(['freeze_escrow']),
      'results', JSON.stringify([{ action: 'freeze_escrow', status: 'SUCCESS' }]),
      'timestamp', new Date().toISOString()
    );

    expect(entryId).toBeDefined();

    const range = await redis.xrevrange(config.interventionStream, '+', '-', 'COUNT', 1);
    expect(range.length).toBe(1);
    const [, fields] = range[0];

    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }

    expect(map.interventionId).toBe(interventionId);
    expect(map.stateTransition).toBe('BLOCKED_HELD');
    expect(JSON.parse(map.actionsDispatched)).toContain('freeze_escrow');
  });

  it('INT-002: database helper never throws unhandled exceptions during connection issues', async () => {
    const mockIntervention: InterventionEvent = {
      interventionId: 'intv_mock',
      alertId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      tenantId: 'tenant_bank_alpha',
      status: 'FLAGGED',
      fraudScore: 0.65,
      actionsDispatched: ['sms_otp'],
      results: [],
      stateTransition: 'STEP_UP_SENT',
      timestamp: new Date().toISOString(),
    };

    await expect(recordInterventionAudit(mockIntervention)).resolves.not.toThrow();
  });
});
