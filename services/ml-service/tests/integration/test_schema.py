"""Schema integrity tests. Require the Compose Postgres with migrations applied."""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest
from psycopg.types.json import Jsonb

CORE_TABLES = (
    "tenants",
    "users",
    "borrowers",
    "transactions",
    "fraud_events",
    "loan_distress_scores",
    "audit_log",
    "model_versions",
)

APPEND_ONLY_SQLSTATES = {"55000", "42501"}


def _tenant(conn: psycopg.Connection) -> uuid.UUID:
    row = conn.execute("INSERT INTO tenants (name) VALUES ('t') RETURNING id").fetchone()
    assert row is not None
    return row[0]


def _transaction(conn: psycopg.Connection, tenant_id: uuid.UUID) -> uuid.UUID:
    row = conn.execute(
        """INSERT INTO transactions
           (tenant_id, from_account_id, to_account_id, amount, currency, channel, occurred_at)
           VALUES (%s, 'a', 'b', 10.5, 'USD', 'mobile', now()) RETURNING id""",
        (tenant_id,),
    ).fetchone()
    assert row is not None
    return row[0]


def _fraud_event(
    conn: psycopg.Connection,
    tenant_id: uuid.UUID,
    transaction_id: uuid.UUID,
    score: float = 0.5,
    status: str = "FLAGGED",
) -> uuid.UUID:
    row = conn.execute(
        """INSERT INTO fraud_events
           (tenant_id, transaction_id, fraud_score, status, model_version)
           VALUES (%s, %s, %s, %s, 'fraud-v1') RETURNING id""",
        (tenant_id, transaction_id, score, status),
    ).fetchone()
    assert row is not None
    return row[0]


def test_core_tables_have_uuid_primary_keys(owner_conn: psycopg.Connection) -> None:
    rows = owner_conn.execute(
        """SELECT c.relname, format_type(a.atttypid, a.atttypmod)
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
           WHERE i.indisprimary AND c.relnamespace = 'public'::regnamespace"""
    ).fetchall()
    pk_types = dict(rows)
    for table in CORE_TABLES:
        assert pk_types.get(table) == "uuid", table


def test_required_columns_exist(owner_conn: psycopg.Connection) -> None:
    expected = {
        "fraud_events": {
            "transaction_id",
            "fraud_score",
            "status",
            "graph_hops",
            "fraud_ring_ids",
            "model_version",
            "scored_at",
            "shap_values",
            "audit_summary",
            "features_snap",
            "resolution",
            "tenant_id",
        },
        "loan_distress_scores": {
            "borrower_id",
            "distress_score",
            "risk_band",
            "model_version",
            "features_snap",
            "evaluated_at",
            "shap_values",
            "audit_summary",
            "tenant_id",
        },
    }
    for table, columns in expected.items():
        found = {
            row[0]
            for row in owner_conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
                (table,),
            )
        }
        assert columns <= found, (table, columns - found)


def test_expected_indexes_exist(owner_conn: psycopg.Connection) -> None:
    names = {
        row[0]
        for row in owner_conn.execute(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
        )
    }
    for index in (
        "fraud_events_status_scored_at_idx",
        "fraud_events_transaction_id_idx",
        "loan_distress_borrower_evaluated_idx",
        "loan_distress_risk_band_evaluated_idx",
        "audit_log_entity_idx",
        "transactions_tenant_occurred_idx",
        "fraud_events_resolution_idx",
    ):
        assert index in names, index


def test_fraud_event_cannot_reference_other_tenant_transaction(
    owner_conn: psycopg.Connection,
) -> None:
    tenant_a, tenant_b = _tenant(owner_conn), _tenant(owner_conn)
    transaction_id = _transaction(owner_conn, tenant_a)
    with pytest.raises(psycopg.errors.ForeignKeyViolation), owner_conn.transaction():
        _fraud_event(owner_conn, tenant_b, transaction_id)


def test_distress_score_cannot_reference_other_tenant_borrower(
    owner_conn: psycopg.Connection,
) -> None:
    tenant_a, tenant_b = _tenant(owner_conn), _tenant(owner_conn)
    borrower = owner_conn.execute(
        "INSERT INTO borrowers (tenant_id) VALUES (%s) RETURNING id", (tenant_a,)
    ).fetchone()
    assert borrower is not None
    with pytest.raises(psycopg.errors.ForeignKeyViolation), owner_conn.transaction():
        owner_conn.execute(
            """INSERT INTO loan_distress_scores
               (tenant_id, borrower_id, distress_score, risk_band, model_version, features_snap)
               VALUES (%s, %s, 50, 'MEDIUM', 'distress-v1', '{}')""",
            (tenant_b, borrower[0]),
        )


@pytest.mark.parametrize(
    ("score", "status"),
    [(1.5, "FLAGGED"), (-0.1, "FLAGGED"), (0.5, "UNKNOWN")],
)
def test_fraud_event_check_constraints(
    owner_conn: psycopg.Connection, score: float, status: str
) -> None:
    tenant_id = _tenant(owner_conn)
    transaction_id = _transaction(owner_conn, tenant_id)
    with pytest.raises(psycopg.errors.CheckViolation), owner_conn.transaction():
        _fraud_event(owner_conn, tenant_id, transaction_id, score=score, status=status)


def test_fraud_event_resolution_default_and_check(owner_conn: psycopg.Connection) -> None:
    tenant_id = _tenant(owner_conn)
    transaction_id = _transaction(owner_conn, tenant_id)
    event_id = _fraud_event(owner_conn, tenant_id, transaction_id)
    row = owner_conn.execute(
        "SELECT resolution FROM fraud_events WHERE id = %s", (event_id,)
    ).fetchone()
    assert row == ("PENDING",)
    with pytest.raises(psycopg.errors.CheckViolation), owner_conn.transaction():
        owner_conn.execute(
            "UPDATE fraud_events SET resolution = 'BOGUS' WHERE id = %s", (event_id,)
        )


def test_one_event_per_transaction_and_model_version(owner_conn: psycopg.Connection) -> None:
    tenant_id = _tenant(owner_conn)
    transaction_id = _transaction(owner_conn, tenant_id)
    _fraud_event(owner_conn, tenant_id, transaction_id)
    with pytest.raises(psycopg.errors.UniqueViolation), owner_conn.transaction():
        _fraud_event(owner_conn, tenant_id, transaction_id)


@pytest.mark.parametrize("score", [-1, 101])
def test_distress_score_range(owner_conn: psycopg.Connection, score: int) -> None:
    tenant_id = _tenant(owner_conn)
    borrower = owner_conn.execute(
        "INSERT INTO borrowers (tenant_id) VALUES (%s) RETURNING id", (tenant_id,)
    ).fetchone()
    assert borrower is not None
    with pytest.raises(psycopg.errors.CheckViolation), owner_conn.transaction():
        owner_conn.execute(
            """INSERT INTO loan_distress_scores
               (tenant_id, borrower_id, distress_score, risk_band, model_version, features_snap)
               VALUES (%s, %s, %s, 'LOW', 'distress-v1', '{}')""",
            (tenant_id, borrower[0], score),
        )


def test_jsonb_snapshots_round_trip(owner_conn: psycopg.Connection) -> None:
    tenant_id = _tenant(owner_conn)
    transaction_id = _transaction(owner_conn, tenant_id)
    event_id = _fraud_event(owner_conn, tenant_id, transaction_id)
    shap = [{"feature": "amount_zscore", "value": 12.4, "contribution": 0.34}]
    owner_conn.execute(
        "UPDATE fraud_events SET shap_values = %s, features_snap = %s WHERE id = %s",
        (Jsonb(shap), Jsonb({"amount_zscore": 12.4}), event_id),
    )
    row = owner_conn.execute(
        "SELECT shap_values, features_snap FROM fraud_events WHERE id = %s", (event_id,)
    ).fetchone()
    assert row is not None
    assert row[0] == shap
    assert json.loads(json.dumps(row[1])) == {"amount_zscore": 12.4}


def _audit_insert(conn: psycopg.Connection) -> uuid.UUID:
    row = conn.execute(
        """INSERT INTO audit_log (entity_type, entity_id, event_type, actor, payload)
           VALUES ('FRAUD_EVENT', gen_random_uuid(), 'SCORED', 'SYSTEM', '{}') RETURNING id""",
    ).fetchone()
    assert row is not None
    return row[0]


@pytest.mark.parametrize("role_fixture", ["owner_conn", "app_conn"])
def test_audit_log_is_append_only(role_fixture: str, request: pytest.FixtureRequest) -> None:
    conn: psycopg.Connection = request.getfixturevalue(role_fixture)
    audit_id = _audit_insert(conn)
    assert conn.execute("SELECT count(*) FROM audit_log WHERE id = %s", (audit_id,)).fetchone() == (
        1,
    )
    statements = (
        ("UPDATE audit_log SET actor = 'x' WHERE id = %s", (audit_id,)),
        ("DELETE FROM audit_log WHERE id = %s", (audit_id,)),
        ("TRUNCATE audit_log", None),
    )
    for sql, params in statements:
        with pytest.raises(psycopg.Error) as excinfo, conn.transaction():
            conn.execute(sql, params)  # type: ignore[arg-type]
        assert excinfo.value.sqlstate in APPEND_ONLY_SQLSTATES, sql


def test_audit_triggers_are_installed(owner_conn: psycopg.Connection) -> None:
    names = {
        row[0]
        for row in owner_conn.execute(
            "SELECT tgname FROM pg_trigger "
            "WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal"
        )
    }
    assert {"audit_log_no_mutation", "audit_log_no_truncate"} <= names


def test_audit_log_rejects_unknown_event_type(app_conn: psycopg.Connection) -> None:
    with pytest.raises(psycopg.errors.CheckViolation), app_conn.transaction():
        app_conn.execute(
            """INSERT INTO audit_log (entity_type, entity_id, event_type, actor, payload)
               VALUES ('FRAUD_EVENT', gen_random_uuid(), 'BOGUS', 'SYSTEM', '{}')"""
        )


def test_app_role_can_write_business_tables(app_conn: psycopg.Connection) -> None:
    tenant_id = _tenant(app_conn)
    transaction_id = _transaction(app_conn, tenant_id)
    event_id = _fraud_event(app_conn, tenant_id, transaction_id)
    assert event_id


def test_app_role_cannot_change_schema(app_conn: psycopg.Connection) -> None:
    app_conn.execute("SELECT 1")  # open an outer transaction so nothing below can commit
    with pytest.raises(psycopg.errors.InsufficientPrivilege), app_conn.transaction():
        app_conn.execute("DROP TRIGGER audit_log_no_mutation ON audit_log")
