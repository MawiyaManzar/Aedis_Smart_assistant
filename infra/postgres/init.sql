-- Aedis local schema bootstrap.
-- Applied on first PostgreSQL container start.
-- Alembic revision 001_initial executes this file when the tables are absent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer NOLOGIN;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants (id),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- Required by loan_distress_scores.borrower_id in the architecture spec.
CREATE TABLE IF NOT EXISTS borrowers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants (id),
  external_ref TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS borrowers_tenant_id_idx ON borrowers (tenant_id);

CREATE TABLE IF NOT EXISTS transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants (id),
  borrower_id      UUID REFERENCES borrowers (id),
  from_account_id  TEXT NOT NULL,
  to_account_id    TEXT NOT NULL,
  amount           NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  currency         CHAR(3) NOT NULL,
  channel          TEXT NOT NULL CHECK (channel IN ('mobile', 'web', 'atm', 'branch')),
  device_id        TEXT,
  ip_address       TEXT,
  category         TEXT,
  closing_balance  NUMERIC(18, 4),
  occurred_at      TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_tenant_occurred_idx
  ON transactions (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_borrower_occurred_idx
  ON transactions (borrower_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_from_account_idx
  ON transactions (tenant_id, from_account_id);
CREATE INDEX IF NOT EXISTS transactions_to_account_idx
  ON transactions (tenant_id, to_account_id);

CREATE TABLE IF NOT EXISTS fraud_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants (id),
  transaction_id  UUID NOT NULL REFERENCES transactions (id),
  fraud_score     NUMERIC(5, 4) NOT NULL CHECK (fraud_score >= 0 AND fraud_score <= 1),
  status          TEXT NOT NULL CHECK (status IN ('APPROVED', 'FLAGGED', 'BLOCKED')),
  resolution      TEXT,
  graph_hops      INTEGER,
  fraud_ring_ids  TEXT[],
  model_version   TEXT NOT NULL,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  shap_values     JSONB,
  audit_summary   TEXT
);

CREATE INDEX IF NOT EXISTS fraud_events_transaction_id_idx ON fraud_events (transaction_id);
CREATE INDEX IF NOT EXISTS fraud_events_status_scored_at_idx
  ON fraud_events (status, scored_at DESC);
CREATE INDEX IF NOT EXISTS fraud_events_tenant_scored_at_idx
  ON fraud_events (tenant_id, scored_at DESC);

CREATE TABLE IF NOT EXISTS loan_distress_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants (id),
  borrower_id     UUID NOT NULL REFERENCES borrowers (id),
  distress_score  SMALLINT NOT NULL CHECK (distress_score BETWEEN 0 AND 100),
  risk_band       TEXT NOT NULL CHECK (risk_band IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  model_version   TEXT NOT NULL,
  features_snap   JSONB NOT NULL,
  evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  shap_values     JSONB,
  audit_summary   TEXT
);

CREATE INDEX IF NOT EXISTS loan_distress_borrower_evaluated_idx
  ON loan_distress_scores (borrower_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS loan_distress_risk_band_evaluated_idx
  ON loan_distress_scores (risk_band, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS loan_distress_tenant_evaluated_idx
  ON loan_distress_scores (tenant_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants (id),
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('FRAUD_EVENT', 'DISTRESS_SCORE')),
  entity_id    UUID NOT NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN ('SCORED', 'EXPLAINED', 'INTERVENED', 'RESOLVED')),
  actor        TEXT NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_mutation ON audit_log;
CREATE TRIGGER audit_log_no_mutation
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'audit_insert_only'
  ) THEN
    CREATE POLICY audit_insert_only ON audit_log
      FOR INSERT
      TO audit_writer
      WITH CHECK (true);
  END IF;
END
$$;

REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
GRANT INSERT ON audit_log TO audit_writer;
GRANT USAGE ON SCHEMA public TO audit_writer;
