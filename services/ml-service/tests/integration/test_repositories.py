from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import psycopg
import pytest
from sqlalchemy import Engine, text

from app.db.repositories import (
    FraudEventRepository,
    ModelVersionRepository,
    PostgresHistoryProvider,
    TransactionRepository,
)
from app.schemas.transaction import TransactionEvent


@pytest.fixture
def tenant_id(owner_conn: psycopg.Connection) -> Iterator[UUID]:
    tid = uuid4()
    owner_conn.execute("INSERT INTO tenants (id, name) VALUES (%s, %s)", (tid, "t-repo"))
    owner_conn.commit()
    yield tid
    owner_conn.execute("DELETE FROM fraud_events WHERE tenant_id = %s", (tid,))
    owner_conn.execute("DELETE FROM transactions WHERE tenant_id = %s", (tid,))
    owner_conn.execute("DELETE FROM tenants WHERE id = %s", (tid,))
    owner_conn.commit()


def _event(tid: UUID, ts: datetime) -> TransactionEvent:
    return TransactionEvent(
        tenant_id=tid, transaction_id=uuid4(), from_account_id="a", to_account_id="b",
        amount=25, currency="USD", channel="web", device_id="d1", timestamp=ts,
    )  # fmt: skip


def test_insert_idempotent_history_strict_and_fraud_upsert(
    tenant_id: UUID, app_engine: Engine
) -> None:
    base = datetime(2026, 1, 10, 12, tzinfo=UTC)
    first, second = _event(tenant_id, base), _event(tenant_id, base + timedelta(hours=1))
    txs, frauds = TransactionRepository(), FraudEventRepository()
    with app_engine.begin() as conn:
        assert txs.insert(conn, first) is True
        assert txs.insert(conn, first) is False  # replay
        assert txs.insert(conn, second) is True
        args = {
            "tenant_id": tenant_id, "transaction_id": first.transaction_id, "graph_hops": 1,
            "graph_status": "OK", "fraud_ring_ids": ["r1"], "model_version": "fraud-v1",
            "features": {"x": 1}, "inference_latency_ms": 1.2,
        }  # fmt: skip
        id1 = frauds.upsert(conn, fraud_score=0.91, status="BLOCKED", **args)
        id2 = frauds.upsert(conn, fraud_score=0.5, status="FLAGGED", **args)
        assert id1 == id2
        row = frauds.get(conn, tenant_id, id1)
        assert row is not None
        assert row["status"] == "FLAGGED" and row["resolution"] == "PENDING"
        assert frauds.get(conn, uuid4(), id1) is None  # tenant-scoped

    provider = PostgresHistoryProvider(app_engine)
    day = timedelta(days=1)
    assert provider.outgoing_history(tenant_id, "a", base, day) == []  # strictly before
    rows = provider.outgoing_history(tenant_id, "a", base + timedelta(hours=1), day)
    assert [r.transaction_id for r in rows] == [first.transaction_id]
    assert provider.device_first_seen(tenant_id, "d1") == base
    assert provider.device_first_seen(tenant_id, "unknown") is None


def test_model_version_registration_is_idempotent(
    app_engine: Engine, owner_conn: psycopg.Connection
) -> None:
    version = f"test-{uuid4().hex[:6]}"
    meta = {
        "model_name": "fraud", "model_version": version, "feature_version": "fv",
        "feature_list": ["a"], "metrics": {}, "trained_at": "2026-01-01T00:00:00+00:00",
    }  # fmt: skip
    repo = ModelVersionRepository()
    try:
        with app_engine.begin() as conn:
            repo.register(conn, meta, "artifacts/x")
            repo.register(conn, meta, "artifacts/x")
            count = conn.execute(
                text("SELECT count(*) FROM model_versions WHERE model_version = :v"), {"v": version}
            ).scalar_one()
        assert count == 1
    finally:
        owner_conn.execute("DELETE FROM model_versions WHERE model_version = %s", (version,))
        owner_conn.commit()
