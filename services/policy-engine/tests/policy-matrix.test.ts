import { describe, it, expect } from 'vitest';
import { getActivePolicy, getPolicyRule, setActivePolicy } from '../src/matrix/loader.js';
import { PolicyMatrix } from '../src/types.js';

describe('Policy Matrix & Hot-Reload Engine (ADR-005)', () => {
  it('loads default bank-grade graduated rules accurately', () => {
    const policy = getActivePolicy();
    expect(policy).toHaveProperty('fraud');
    expect(policy.fraud.FLAGGED.actions).toContain('sms_otp');
    expect(policy.fraud.FLAGGED.ttl_seconds).toBe(120);
    expect(policy.fraud.BLOCKED.actions).toContain('freeze_escrow');
  });

  it('correctly maps policy rules by status', () => {
    const flaggedRule = getPolicyRule('FLAGGED');
    expect(flaggedRule.actions).toEqual(['sms_otp', 'whatsapp_otp']);

    const blockedRule = getPolicyRule('BLOCKED');
    expect(blockedRule.actions).toEqual(['freeze_escrow']);
  });

  it('supports hot-reloading policy matrix dynamically at runtime', () => {
    const customMatrix: PolicyMatrix = {
      version: '2.0.0-emergency-freeze',
      updatedAt: new Date().toISOString(),
      fraud: {
        FLAGGED: {
          actions: ['sms_otp', 'in_app_nudge'],
          ttl_seconds: 60,
        },
        BLOCKED: {
          actions: ['freeze_escrow', 'analyst_dashboard'],
        },
      },
    };

    setActivePolicy(customMatrix);

    const reloaded = getActivePolicy();
    expect(reloaded.version).toBe('2.0.0-emergency-freeze');
    expect(getPolicyRule('FLAGGED').ttl_seconds).toBe(60);
    expect(getPolicyRule('FLAGGED').actions).toContain('in_app_nudge');
  });
});
