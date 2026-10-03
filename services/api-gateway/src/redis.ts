import Redis from 'ioredis';
import { config } from './config.js';

// Connect to Redis
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis successfully');
});

redis.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err.message);
});

/**
 * Pushes a raw transaction event into Redis Streams.
 * Takes ~1ms.
 */
export async function pushTransactionToStream(event: {
  tenantId: string;
  transactionId: string;
  payload: string;
}): Promise<string> {
  // XADD stream:transaction:raw * tenantId ... transactionId ... payload ...
  const entryId = await redis.xadd(
    config.streamName,
    '*', // '*' tells Redis to auto-generate a timestamp-based ID (e.g. 1730000000-0)
    'tenantId', event.tenantId,
    'transactionId', event.transactionId,
    'payload', event.payload,
    'receivedAt', Date.now().toString()
  );
  return entryId;
}
