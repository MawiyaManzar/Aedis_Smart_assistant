import pg from 'pg';
import { config } from '../config.js';
import { AuditLogEntry, ShapDriver } from '../types.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let isDbConnected = false;

export function getPostgresPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.postgresUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.warn('⚠️ Audit DB connection warning:', err.message);
    });
  }
  return pool;
}

/**
 * Initializes immutable audit_log schema and indices.
 */
export async function initAuditDb(): Promise<boolean> {
  const client = getPostgresPool();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type     TEXT NOT NULL CHECK (entity_type IN ('FRAUD_EVENT','DISTRESS_SCORE')),
        entity_id       UUID NOT NULL,
        event_type      TEXT NOT NULL,
        actor           TEXT NOT NULL,
        payload         JSONB NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
    `);
    isDbConnected = true;
    console.log('✅ PostgreSQL connected and audit_log table verified');
    return true;
  } catch (err: any) {
    console.warn(`⚠️ PostgreSQL audit table unavailable (${err.message}). Continuing in stream-only mode.`);
    isDbConnected = false;
    return false;
  }
}

/**
 * Appends immutable record into audit_log table.
 */
export async function insertAuditLog(entry: AuditLogEntry): Promise<void> {
  if (!isDbConnected) {
    const connected = await initAuditDb().catch(() => false);
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
        entry.entityType,
        entry.entityId,
        entry.eventType,
        entry.actor,
        JSON.stringify(entry.payload),
      ]
    );
  } catch (err: any) {
    console.error(`❌ Failed to insert audit_log for ${entry.entityId}:`, err.message);
  }
}

/**
 * Updates fraud_events record with SHAP drivers and OpenRouter regulatory summary.
 */
export async function updateFraudEventExplanation(
  transactionId: string,
  shapDrivers: ShapDriver[],
  auditSummary: string
): Promise<void> {
  if (!isDbConnected) return;

  try {
    const client = getPostgresPool();
    await client.query(
      `
      UPDATE fraud_events
      SET shap_values = $1, audit_summary = $2
      WHERE transaction_id = $3
      `,
      [JSON.stringify(shapDrivers), auditSummary, transactionId]
    );
  } catch (err: any) {
    console.error(`❌ Failed to update fraud_events explanation for ${transactionId}:`, err.message);
  }
}

export async function closeAuditDb(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
    isDbConnected = false;
  }
}
