import pg from 'pg';
import { config } from '../config.js';

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
      console.warn('⚠️ Postgres client error (resilient worker continuing):', err.message);
    });
  }
  return pool;
}

/**
 * Initializes PostgreSQL schema for fraud_events if not already present.
 */
export async function initPostgres(): Promise<boolean> {
  const client = getPostgresPool();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fraud_events (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id  UUID NOT NULL,
        fraud_score     NUMERIC(5,4) NOT NULL,
        status          TEXT NOT NULL CHECK (status IN ('APPROVED','FLAGGED','BLOCKED')),
        graph_hops      INT,
        fraud_ring_ids  TEXT[],
        model_version   TEXT NOT NULL,
        scored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        shap_values     JSONB,
        audit_summary   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_fraud_events_tx ON fraud_events (transaction_id);
      CREATE INDEX IF NOT EXISTS idx_fraud_events_status_time ON fraud_events (status, scored_at DESC);
    `);
    isDbConnected = true;
    console.log('✅ PostgreSQL connected and fraud_events table verified');
    return true;
  } catch (err: any) {
    console.warn(`⚠️ PostgreSQL connection not available (${err.message}). In-memory / Stream scoring will continue.`);
    isDbConnected = false;
    return false;
  }
}

export interface SaveFraudEventParams {
  transactionId: string;
  fraudScore: number;
  status: 'APPROVED' | 'FLAGGED' | 'BLOCKED';
  graphHops: number;
  fraudRingIds: string[];
  modelVersion: string;
}

/**
 * Inserts scored fraud event into PostgreSQL fraud_events table.
 */
export async function saveFraudEvent(params: SaveFraudEventParams): Promise<void> {
  if (!isDbConnected) {
    // Try reconnecting once in case DB became healthy
    const connected = await initPostgres().catch(() => false);
    if (!connected) return;
  }

  try {
    const client = getPostgresPool();
    await client.query(
      `
      INSERT INTO fraud_events (
        transaction_id,
        fraud_score,
        status,
        graph_hops,
        fraud_ring_ids,
        model_version,
        scored_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [
        params.transactionId,
        params.fraudScore,
        params.status,
        params.graphHops,
        params.fraudRingIds,
        params.modelVersion,
      ]
    );
  } catch (err: any) {
    console.error(`❌ Failed to save fraud event for ${params.transactionId}:`, err.message);
  }
}

export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
    isDbConnected = false;
  }
}
