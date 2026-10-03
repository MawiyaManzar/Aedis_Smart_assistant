"""Tenant-scoped integrity, model registry, audit hardening, restricted app role.

Revision ID: 002_integrity
Revises: 001_initial
Create Date: 2026-10-03

"""

from __future__ import annotations

import os

from alembic import op

revision = "002_integrity"
down_revision = "001_initial"
branch_labels = None
depends_on = None

RESOLUTIONS = (
    "'PENDING','STEP_UP_SENT','STEP_UP_PASSED','STEP_UP_FAILED',"
    "'OVERRIDE_APPROVE','CONFIRM_BLOCK','ESCALATE'"
)

STATEMENTS = [
    # Composite keys so child rows cannot point at another tenant's parent.
    "ALTER TABLE transactions ADD CONSTRAINT transactions_tenant_id_id_key UNIQUE (tenant_id, id)",
    "ALTER TABLE borrowers ADD CONSTRAINT borrowers_tenant_id_id_key UNIQUE (tenant_id, id)",
    "ALTER TABLE fraud_events DROP CONSTRAINT IF EXISTS fraud_events_transaction_id_fkey",
    "ALTER TABLE fraud_events ADD CONSTRAINT fraud_events_tenant_transaction_fkey "
    "FOREIGN KEY (tenant_id, transaction_id) REFERENCES transactions (tenant_id, id)",
    "ALTER TABLE loan_distress_scores DROP CONSTRAINT IF EXISTS "
    "loan_distress_scores_borrower_id_fkey",
    "ALTER TABLE loan_distress_scores ADD CONSTRAINT loan_distress_tenant_borrower_fkey "
    "FOREIGN KEY (tenant_id, borrower_id) REFERENCES borrowers (tenant_id, id)",
    "ALTER TABLE transactions ADD CONSTRAINT transactions_borrower_tenant_fkey "
    "FOREIGN KEY (tenant_id, borrower_id) REFERENCES borrowers (tenant_id, id)",
    "ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_borrower_id_fkey",
    # Fraud event resolution state machine and scoring snapshot columns.
    "UPDATE fraud_events SET resolution = 'PENDING' WHERE resolution IS NULL",
    "ALTER TABLE fraud_events ALTER COLUMN resolution SET DEFAULT 'PENDING'",
    "ALTER TABLE fraud_events ALTER COLUMN resolution SET NOT NULL",
    f"ALTER TABLE fraud_events ADD CONSTRAINT fraud_events_resolution_check "
    f"CHECK (resolution IN ({RESOLUTIONS}))",
    "ALTER TABLE fraud_events ADD COLUMN IF NOT EXISTS features_snap JSONB",
    "ALTER TABLE fraud_events ADD COLUMN IF NOT EXISTS graph_status TEXT "
    "CHECK (graph_status IN ('OK','DEGRADED','SKIPPED'))",
    "ALTER TABLE fraud_events ADD COLUMN IF NOT EXISTS inference_latency_ms NUMERIC(10,3)",
    "ALTER TABLE fraud_events ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ",
    "ALTER TABLE fraud_events ADD COLUMN IF NOT EXISTS resolved_by TEXT",
    "CREATE INDEX IF NOT EXISTS fraud_events_resolution_idx "
    "ON fraud_events (tenant_id, resolution, scored_at DESC)",
    "CREATE UNIQUE INDEX IF NOT EXISTS fraud_events_tx_model_uniq "
    "ON fraud_events (transaction_id, model_version)",
    # Model registry.
    """CREATE TABLE IF NOT EXISTS model_versions (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      model_name     TEXT NOT NULL CHECK (model_name IN ('fraud','distress')),
      model_version  TEXT NOT NULL,
      feature_version TEXT NOT NULL,
      feature_list   JSONB NOT NULL,
      metrics        JSONB NOT NULL,
      artifact_path  TEXT NOT NULL,
      trained_at     TIMESTAMPTZ NOT NULL,
      registered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      data_source    TEXT NOT NULL DEFAULT 'synthetic',
      UNIQUE (model_name, model_version)
    )""",
    # Audit hardening: block TRUNCATE as well as row UPDATE/DELETE.
    """CREATE OR REPLACE FUNCTION prevent_audit_log_truncate()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '55000';
    END;
    $$""",
    "DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log",
    "CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log "
    "FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_truncate()",
    "DROP POLICY IF EXISTS audit_app_insert ON audit_log",
    "CREATE POLICY audit_app_insert ON audit_log FOR INSERT TO aedis_app WITH CHECK (true)",
    "DROP POLICY IF EXISTS audit_app_select ON audit_log",
    "CREATE POLICY audit_app_select ON audit_log FOR SELECT TO aedis_app USING (true)",
]

GRANTS = [
    "GRANT USAGE ON SCHEMA public TO aedis_app",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON tenants, users, borrowers, transactions, "
    "fraud_events, loan_distress_scores, model_versions TO aedis_app",
    "REVOKE ALL ON audit_log FROM aedis_app",
    "GRANT SELECT, INSERT ON audit_log TO aedis_app",
]


def upgrade() -> None:
    bind = op.get_bind()
    password = os.environ.get("AEDIS_APP_PASSWORD", "aedis_app_password").replace("'", "''")
    bind.exec_driver_sql(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aedis_app') THEN "
        f"CREATE ROLE aedis_app LOGIN PASSWORD '{password}'; "
        f"ELSE ALTER ROLE aedis_app LOGIN PASSWORD '{password}'; END IF; END $$"
    )
    for statement in STATEMENTS:
        op.execute(statement)
    for statement in GRANTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in (
        "DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log",
        "DROP FUNCTION IF EXISTS prevent_audit_log_truncate()",
        "DROP POLICY IF EXISTS audit_app_insert ON audit_log",
        "DROP POLICY IF EXISTS audit_app_select ON audit_log",
        "DROP TABLE IF EXISTS model_versions",
        "ALTER TABLE fraud_events DROP CONSTRAINT IF EXISTS fraud_events_resolution_check",
        "ALTER TABLE fraud_events DROP CONSTRAINT IF EXISTS fraud_events_tenant_transaction_fkey",
        "ALTER TABLE loan_distress_scores DROP CONSTRAINT IF EXISTS "
        "loan_distress_tenant_borrower_fkey",
        "ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_borrower_tenant_fkey",
        "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM aedis_app",
        "REVOKE USAGE ON SCHEMA public FROM aedis_app",
        "DROP ROLE IF EXISTS aedis_app",
    ):
        op.execute(statement)
