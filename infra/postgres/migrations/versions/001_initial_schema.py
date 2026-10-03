"""Initial Aedis schema.

Revision ID: 001_initial
Revises:
Create Date: 2026-10-03

"""

from __future__ import annotations

import sys
from pathlib import Path

from alembic import op

REPO_ROOT = Path(__file__).resolve().parents[4]
ML_SERVICE_ROOT = REPO_ROOT / "services" / "ml-service"
if str(ML_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_SERVICE_ROOT))

from app.db.sql_script import split_sql  # noqa: E402

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[2] / "init.sql"


def upgrade() -> None:
    bind = op.get_bind()
    exists = bind.exec_driver_sql("SELECT to_regclass('public.tenants') IS NOT NULL").scalar()
    if exists:
        return
    script = SQL_PATH.read_text(encoding="utf-8")
    for statement in split_sql(script):
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_mutation()")
    op.execute("DROP TABLE IF EXISTS loan_distress_scores")
    op.execute("DROP TABLE IF EXISTS fraud_events")
    op.execute("DROP TABLE IF EXISTS transactions")
    op.execute("DROP TABLE IF EXISTS borrowers")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TABLE IF EXISTS tenants")
    op.execute("DROP ROLE IF EXISTS audit_writer")
