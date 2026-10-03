import { Redis } from 'ioredis';
import { config } from './config.js';

// Connect to Redis
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis successfully');
});

redis.on('error', (err: any) => {
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
  return entryId || '';
}

function parseStreamEntry(entry: [string, string[]]) {
  const [id, rawFields] = entry;
  const parsed: Record<string, any> = { streamEntryId: id };
  for (let i = 0; i < rawFields.length; i += 2) {
    const key = rawFields[i];
    const val = rawFields[i + 1];
    if (key === 'velocity' || key === 'fraudRingIds' || key === 'payload') {
      try {
        parsed[key] = JSON.parse(val);
      } catch {
        parsed[key] = val;
      }
    } else {
      parsed[key] = val;
    }
  }
  return parsed;
}

/**
 * Retrieves the latest generated alerts from stream:alert:created
 */
export async function getRecentAlerts(count = 20): Promise<any[]> {
  try {
    const entries = (await redis.xrevrange(
      config.alertStream,
      '+',
      '-',
      'COUNT',
      count
    )) as [string, string[]][];

    return (entries || []).map(parseStreamEntry);
  } catch (err: any) {
    console.error('Failed to query alert stream:', err.message);
    return [];
  }
}

/**
 * Reads real-time atomic velocity features stored by fraud-worker
 */
export async function getAccountVelocity(accountId: string) {
  const key1m = `feat:velocity:1m:${accountId}`;
  const key1h = `feat:velocity:1h:${accountId}`;
  const key24h = `feat:velocity:24h:${accountId}`;
  const keySum1h = `feat:amount_sum:1h:${accountId}`;

  const [c1m, c1h, c24h, sum1h] = await redis.mget(key1m, key1h, key24h, keySum1h);

  return {
    accountId,
    count1m: parseInt(c1m || '0', 10),
    count1h: parseInt(c1h || '0', 10),
    count24h: parseInt(c24h || '0', 10),
    sumAmount1h: parseFloat(sum1h || '0'),
  };
}

/**
 * Persists an analyst resolution event and publishes to stream:resolution:logged
 */
export async function resolveAlertEvent(
  alertId: string,
  resolution: string,
  analystNote: string = '',
  analystId: string = 'user_analyst_01'
) {
  const resolutionId = `res_${Date.now()}`;
  await redis.xadd(
    'stream:resolution:logged',
    '*',
    'resolutionId', resolutionId,
    'alertId', alertId,
    'resolution', resolution,
    'analystNote', analystNote,
    'analystId', analystId,
    'timestamp', new Date().toISOString()
  );

  return {
    resolutionId,
    alertId,
    resolution,
    analystNote,
    analystId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Returns stream telemetry for the System Architect dashboard
 */
export async function getStreamTelemetry() {
  const [rawLen, alertLen, resLen] = await Promise.all([
    redis.xlen(config.streamName).catch(() => 0),
    redis.xlen(config.alertStream).catch(() => 0),
    redis.xlen('stream:resolution:logged').catch(() => 0),
  ]);

  return {
    rawStreamLength: rawLen,
    alertStreamLength: alertLen,
    resolutionStreamLength: resLen,
    redisStatus: redis.status,
    rawStream: config.streamName,
    alertStream: config.alertStream,
  };
}

