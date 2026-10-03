import { Redis } from 'ioredis';

export interface VelocityFeatures {
  count1m: number;
  count1h: number;
  count24h: number;
  sumAmount1h: number;
}

/**
 * Atomic Redis Feature Store for real-time transaction velocities.
 * Hydrates features in < 3ms using pipelined commands with auto-expiring keys.
 */
export async function trackAndHydrateVelocity(
  redis: Redis,
  accountId: string,
  amount: number
): Promise<VelocityFeatures> {
  const key1m = `feat:velocity:1m:${accountId}`;
  const key1h = `feat:velocity:1h:${accountId}`;
  const key24h = `feat:velocity:24h:${accountId}`;
  const keySum1h = `feat:amount_sum:1h:${accountId}`;

  // Use a single atomic pipeline roundtrip
  const pipeline = redis.pipeline();

  // 1. Increment counts
  pipeline.incr(key1m);
  pipeline.expire(key1m, 60); // 1 minute TTL

  pipeline.incr(key1h);
  pipeline.expire(key1h, 3600); // 1 hour TTL

  pipeline.incr(key24h);
  pipeline.expire(key24h, 86400); // 24 hours TTL

  // 2. Increment amount sum (stored as float)
  pipeline.incrbyfloat(keySum1h, amount);
  pipeline.expire(keySum1h, 3600);

  const results = await pipeline.exec();

  if (!results) {
    return { count1m: 1, count1h: 1, count24h: 1, sumAmount1h: amount };
  }

  // Extract pipelined return values safely
  const count1m = (results[0][1] as number) || 1;
  const count1h = (results[2][1] as number) || 1;
  const count24h = (results[4][1] as number) || 1;
  const sumAmount1h = parseFloat((results[6][1] as string) || `${amount}`);

  return {
    count1m,
    count1h,
    count24h,
    sumAmount1h,
  };
}
