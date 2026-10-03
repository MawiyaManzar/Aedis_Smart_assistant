import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { dispatchInterventions, dispatchSmsOtp, dispatchFreezeEscrow } from '../src/interventions/webhooks.js';
import { AlertInputEvent } from '../src/types.js';

describe('Graduated Intervention Webhooks', () => {
  const mockAlert: AlertInputEvent = {
    alertId: crypto.randomUUID(),
    transactionId: crypto.randomUUID(),
    tenantId: 'tenant_bank_alpha',
    status: 'FLAGGED',
    fraudScore: 0.65,
    graphHops: 0,
    fraudRingIds: [],
    velocity: { count1m: 3, count1h: 6, count24h: 10, sumAmount1h: 2500 },
    payload: {
      fromAccountId: 'acc_source_44',
      toAccountId: 'acc_dest_99',
      amount: 1500,
      currency: 'USD',
      channel: 'mobile',
    },
    timestamp: new Date().toISOString(),
  };

  it('dispatches SMS OTP challenge with valid TTL and challenge hash', async () => {
    const result = await dispatchSmsOtp(mockAlert, 'sms_otp');

    expect(result.status).toBe('SUCCESS');
    expect(result.action).toBe('sms_otp');
    expect(result.target).toBe('acc_source_44');
    expect(result.referenceId).toMatch(/^otp_sms_otp_/);
    expect(result.metadata.ttlSeconds).toBe(120);
    expect(result.metadata.challengeCodeHash).toBeDefined();
  });

  it('dispatches Payment Escrow Freeze with hard lock on funds', async () => {
    const blockedAlert: AlertInputEvent = {
      ...mockAlert,
      status: 'BLOCKED',
      fraudScore: 0.94,
      graphHops: 2,
      fraudRingIds: ['ring_alpha_1'],
    };

    const result = await dispatchFreezeEscrow(blockedAlert);

    expect(result.status).toBe('SUCCESS');
    expect(result.action).toBe('freeze_escrow');
    expect(result.metadata.holdType).toBe('HARD_ESCROW_LOCK');
    expect(result.metadata.amount).toBe(1500);
    expect(result.metadata.muleRingsIdentified).toContain('ring_alpha_1');
  });

  it('dispatches multiple actions concurrently via dispatchInterventions', async () => {
    const results = await dispatchInterventions(mockAlert, ['sms_otp', 'whatsapp_otp', 'analyst_dashboard']);

    expect(results.length).toBe(3);
    expect(results.every((r) => r.status === 'SUCCESS')).toBe(true);
    expect(results.map((r) => r.action)).toEqual(['sms_otp', 'whatsapp_otp', 'analyst_dashboard']);
  });
});
