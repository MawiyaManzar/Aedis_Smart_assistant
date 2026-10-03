import { describe, it, expect, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from '../../src/config.js';
import { trackAndHydrateVelocity } from '../../src/features/velocity.js';

describe('Regression: Redis Feature Store Velocity Precision & Isolation', () => {
  const redis = new Redis(config.redisUrl);

  afterAll(async () => {
    await redis.quit();
  });

  it('REG-006: accumulates rapid concurrent burst transfers atomically without race conditions', async () => {
    const burstAccount = `acc_burst_${crypto.randomBytes(4).toString('hex')}`;
    const transferCount = 5;
    const amountPerTransfer = 50.25;

    // Simulate 5 simultaneous transfers
    const promises = Array.from({ length: transferCount }, () =>
      trackAndHydrateVelocity(redis, burstAccount, amountPerTransfer)
    );

    const results = await Promise.all(promises);

    // The final accumulated result should accurately reflect the 5 transfers
    const finalResult = results[results.length - 1];
    expect(finalResult.count1m).toBeGreaterThanOrEqual(transferCount);
    expect(finalResult.count1h).toBeGreaterThanOrEqual(transferCount);
    expect(finalResult.count24h).toBeGreaterThanOrEqual(transferCount);
    expect(finalResult.sumAmount1h).toBeCloseTo(transferCount * amountPerTransfer, 1);
  });

  it('REG-007: guarantees strict tenant & account key isolation', async () => {
    const accountX = `acc_isolated_X_${crypto.randomBytes(4).toString('hex')}`;
    const accountY = `acc_isolated_Y_${crypto.randomBytes(4).toString('hex')}`;

    // Account X performs 3 transactions
    await trackAndHydrateVelocity(redis, accountX, 100);
    await trackAndHydrateVelocity(redis, accountX, 200);
    const resultX = await trackAndHydrateVelocity(redis, accountX, 300);

    // Account Y performs 1 transaction
    const resultY = await trackAndHydrateVelocity(redis, accountY, 50);

    expect(resultX.count1m).toBe(3);
    expect(resultX.sumAmount1h).toBe(600);

    expect(resultY.count1m).toBe(1);
    expect(resultY.sumAmount1h).toBe(50);
  });
});
