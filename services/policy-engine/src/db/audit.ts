import pg from 'pg';
import { config } from '../config.js';
import { InterventionEvent } from '../types.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let isDbConnected = false;

export function getPostgresPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.postgresUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.warn('⚠️ Policy Engine DB warning:', err.message);
    });
  }
  return pool;
}

export async function initPolicyDb(): Promise<boolean> {
  const client = getPostgresPool();
  try {
    // Ensure resolution column exists on fraud_events if not already
    await client.query(`
      ALTER TABLE fraud_events ADD COLUMN IF NOT EXISTS resolution TEXT;
    `).catch(() => {});

    isDbConnected = true;
    return true;
  } catch (err: any) {
    isDbConnected = false;
    return false;
  }
}

/**
 * Persists intervention event into append-only audit_log table.
 */
export async function recordInterventionAudit(intervention: InterventionEvent): Promise<void> {
  if (!isDbConnected) {
    const connected = await initPolicyDb().catch(() => false);
    if (!connected) return;
  }

  try {
    const client = getPostgresPool();
    await client.query(
      `
      INSERT INTO audit_log (
        entity_type,
        entity_id,
        event_type,
        actor,
        payload,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [
        'FRAUD_EVENT',
        intervention.transactionId,
        'INTERVENED',
        'POLICY_ENGINE',
        JSON.stringify({
          interventionId: intervention.interventionId,
          alertId: intervention.alertId,
          status: intervention.status,
          stateTransition: intervention.stateTransition,
          actionsDispatched: intervention.actionsDispatched,
          results: intervention.results,
        }),
      ]
    );

    // Update fraud_events resolution state
    await client.query(
      `UPDATE fraud_events SET resolution = $1 WHERE transaction_id = $2`,
      [intervention.stateTransition, intervention.transactionId]
    ).catch(() => {});
  } catch (err: any) {
    console.error(`❌ Failed to record intervention audit for ${intervention.transactionId}:`, err.message);
  }
}

export async function closePolicyDb(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
    isDbConnected = false;
  }
}
