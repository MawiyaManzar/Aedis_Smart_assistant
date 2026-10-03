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
  const [rawLen, alertLen, resLen, intvLen, auditLen] = await Promise.all([
    redis.xlen(config.streamName).catch(() => 0),
    redis.xlen(config.alertStream).catch(() => 0),
    redis.xlen('stream:resolution:logged').catch(() => 0),
    redis.xlen(config.interventionStream).catch(() => 0),
    redis.xlen(config.auditStream).catch(() => 0),
  ]);

  return {
    rawStreamLength: rawLen,
    alertStreamLength: alertLen,
    resolutionStreamLength: resLen,
    interventionStreamLength: intvLen,
    auditStreamLength: auditLen,
    redisStatus: redis.status,
    rawStream: config.streamName,
    alertStream: config.alertStream,
    interventionStream: config.interventionStream,
    auditStream: config.auditStream,
  };
}

/**
 * Fallback policy matrix matching Section 7 / ADR-005
 */
const DEFAULT_POLICY_MATRIX = {
  version: '1.0.0',
  updatedAt: new Date().toISOString(),
  thresholds: {
    lowThreshold: 35,
    stepUpThreshold: 70,
    freezeThreshold: 85,
  },
  fraud: {
    FLAGGED: {
      actions: ['sms_otp', 'whatsapp_otp'],
      ttl_seconds: 120,
      on_failure: 'escalate_to_BLOCKED',
    },
    BLOCKED: {
      actions: ['freeze_escrow'],
      notify: ['analyst_dashboard'],
    },
  },
  distress: {
    MEDIUM: {
      actions: ['in_app_nudge'],
    },
    HIGH: {
      actions: ['crm_task', 'in_app_nudge'],
    },
    CRITICAL: {
      actions: ['crm_task', 'crm_call', 'soft_hold'],
    },
  },
};

/**
 * Gets active policy matrix from Redis cache or default
 */
export async function getActivePolicyMatrix() {
  try {
    const raw = await redis.get('config:policy:matrix');
    if (raw) return JSON.parse(raw);
  } catch (_e) {}
  return DEFAULT_POLICY_MATRIX;
}

/**
 * Updates policy matrix in Redis and broadcasts hot-reload to channel:policy:reload (ADR-005)
 */
export async function updateAndPublishPolicyMatrix(policyMatrix: any) {
  const versionedMatrix = {
    ...policyMatrix,
    updatedAt: new Date().toISOString(),
    version: policyMatrix.version || `v${Date.now()}`,
  };

  const payload = JSON.stringify(versionedMatrix);
  await redis.set('config:policy:matrix', payload);
  await redis.publish(config.policyReloadChannel, payload);

  return versionedMatrix;
}

/**
 * Returns latest dispatched interventions from stream:intervention:dispatched
 */
export async function getRecentInterventions(count = 20) {
  try {
    const entries = await (redis as any).xrevrange(
      config.interventionStream,
      '+',
      '-',
      'COUNT',
      count
    );

    if (!entries || entries.length === 0) return [];

    return entries.map(([id, fields]: [string, string[]]) => {
      const obj: Record<string, any> = { streamEntryId: id };
      for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1];
      }
      try {
        if (obj.actionsDispatched) obj.actionsDispatched = JSON.parse(obj.actionsDispatched);
        if (obj.results) obj.results = JSON.parse(obj.results);
      } catch (_e) {}
      return obj;
    });
  } catch (err) {
    console.error('Failed to read interventions from Redis stream:', err);
    return [];
  }
}

/**
 * Returns latest explainability audit records from stream:audit:logged
 */
export async function getRecentAuditLogs(count = 20) {
  try {
    const entries = await (redis as any).xrevrange(
      config.auditStream,
      '+',
      '-',
      'COUNT',
      count
    );

    if (!entries || entries.length === 0) return [];

    return entries.map(([id, fields]: [string, string[]]) => {
      const obj: Record<string, any> = { streamEntryId: id };
      for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1];
      }
      try {
        if (obj.shapDrivers) obj.shapDrivers = JSON.parse(obj.shapDrivers);
      } catch (_e) {}
      return obj;
    });
  } catch (err) {
    console.error('Failed to read audit logs from Redis stream:', err);
    return [];
  }
}

