import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import { config } from '../../src/config.js';
import { initPolicyLoader, getActivePolicy, closePolicyLoader, getPolicyRule } from '../../src/matrix/loader.js';
import { PolicyMatrix } from '../../src/types.js';

describe('Regression: Redis Pub/Sub Live Hot-Reloading', () => {
  const publisher = new Redis(config.redisUrl);

  beforeAll(async () => {
    await initPolicyLoader();
  });

  afterAll(async () => {
    await publisher.quit();
    await closePolicyLoader();
  });

  it('POL-REG-003: reloads policy matrix in real-time when message is published to channel:policy:reload', async () => {
    const originalVersion = getActivePolicy().version;
    const newVersion = `version_${Date.now()}`;

    const newMatrix: PolicyMatrix = {
      version: newVersion,
      updatedAt: new Date().toISOString(),
      fraud: {
        FLAGGED: {
          actions: ['sms_otp', 'in_app_nudge'],
          ttl_seconds: 45,
        },
        BLOCKED: {
          actions: ['freeze_escrow'],
        },
      },
    };

    // Publish to Redis channel
    await publisher.publish(config.policyReloadChannel, JSON.stringify(newMatrix));

    // Allow Redis subscriber event loop tick
    await new Promise((r) => setTimeout(r, 60));

    const updated = getActivePolicy();
    expect(updated.version).toBe(newVersion);
    expect(getPolicyRule('FLAGGED').ttl_seconds).toBe(45);
    expect(getPolicyRule('FLAGGED').actions).toEqual(['sms_otp', 'in_app_nudge']);
  });

  it('POL-REG-004: safely ignores malformed JSON without crashing the subscriber or corrupting active policy', async () => {
    const currentVersion = getActivePolicy().version;

    // Publish invalid non-JSON string
    await publisher.publish(config.policyReloadChannel, 'NOT_VALID_JSON{{{');

    await new Promise((r) => setTimeout(r, 60));

    // Active policy must remain uncorrupted
    expect(getActivePolicy().version).toBe(currentVersion);
  });
});
