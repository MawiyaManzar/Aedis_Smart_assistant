import { Redis } from 'ioredis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { config } from '../config.js';
import { PolicyMatrix, PolicyRule } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeMatrix: PolicyMatrix;
let subscriber: Redis | null = null;
let pgPool: pg.Pool | null = null;

function loadDefaultPolicyFile(): PolicyMatrix {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'default-policy.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {
      version: '1.0.0-fallback',
      updatedAt: new Date().toISOString(),
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
    };
  }
}

// Initialize active matrix immediately from file
activeMatrix = loadDefaultPolicyFile();

export function getActivePolicy(): PolicyMatrix {
  return activeMatrix;
}

export function getPolicyRule(status: 'FLAGGED' | 'BLOCKED'): PolicyRule {
  return activeMatrix.fraud[status] || { actions: [] };
}

export function setActivePolicy(newMatrix: PolicyMatrix): void {
  activeMatrix = newMatrix;
  console.log(`🔄 Policy Matrix updated to version ${newMatrix.version} (${newMatrix.updatedAt})`);
}

/**
 * Initializes Redis Pub/Sub listener for hot-reloading policy rules without restarting.
 * (Decision ADR-005)
 */
export async function initPolicyLoader(): Promise<void> {
  // 1. Try loading latest policy matrix from PostgreSQL if available
  try {
    pgPool = new pg.Pool({
      connectionString: config.postgresUrl,
      max: 5,
      connectionTimeoutMillis: 1500,
    });

    const res = await pgPool.query(
      `SELECT policy_json FROM policy_matrix ORDER BY version DESC LIMIT 1`
    );
    if (res.rows.length > 0 && res.rows[0].policy_json) {
      setActivePolicy(res.rows[0].policy_json);
    }
  } catch (_err) {
    // Expected in standalone mode or before migrations run; default JSON used
  }

  // 2. Set up Redis Pub/Sub listener for hot-reloads
  try {
    subscriber = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    await subscriber.subscribe(config.policyReloadChannel);
    subscriber.on('message', (channel, message) => {
      if (channel === config.policyReloadChannel) {
        try {
          const updated = JSON.parse(message);
          setActivePolicy(updated);
        } catch (err: any) {
          console.error('❌ Failed to parse hot-reloaded policy JSON:', err.message);
        }
      }
    });

    console.log(`✅ Policy loader listening on Redis channel: "${config.policyReloadChannel}"`);
  } catch (err: any) {
    console.warn('⚠️ Could not connect Redis subscriber for policy reload:', err.message);
  }
}

export async function closePolicyLoader(): Promise<void> {
  if (subscriber) {
    await subscriber.quit().catch(() => {});
    subscriber = null;
  }
  if (pgPool) {
    await pgPool.end().catch(() => {});
    pgPool = null;
  }
}
