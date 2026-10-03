"""Transaction scoring pipeline against the live stack (Postgres + Neo4j + real models)."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from tests.integration.conftest import _app_url, _connect, _owner_url

from app.core.config import Settings
from app.main import create_app

# Audit rows are append-only and reference the tenant, so the test tenant is permanent and
# reused; only mutable rows are cleaned up.
TENANT = UUID("00000000-0000-4000-8000-0000000000e2")


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    owner_conn = _connect(_owner_url())
    owner_conn.execute(
        "INSERT INTO tenants (id, name) VALUES (%s, 'e2e') ON CONFLICT DO NOTHING", (TENANT,)
    )
    owner_conn.commit()
    app = create_app(
        Settings(
            require_models=True,
            database_url=_app_url(),
            redis_url=os.environ.get("REDIS_URL", "redis://localhost:6380/0"),
        )
    )
    with TestClient(app) as c:
        yield c
        graph = c.app.state.container.graph  # type: ignore[attr-defined]
        graph.run_write("MATCH (a:Account {tenantId: $t}) DETACH DELETE a", t=str(TENANT))
        graph.run_write("MATCH (n) WHERE (n:Device OR n:IPAddress) AND NOT (n)--() DELETE n")
    owner_conn.execute("DELETE FROM fraud_events WHERE tenant_id = %s", (TENANT,))
    owner_conn.execute("DELETE FROM transactions WHERE tenant_id = %s", (TENANT,))
    owner_conn.commit()


def _tx(
    sender: str, receiver: str, amount: float, ts: datetime, **extra: object
) -> dict[str, object]:
    return {
        "tenantId": str(TENANT), "transactionId": str(uuid4()), "fromAccountId": sender,
        "toAccountId": receiver, "amount": amount, "currency": "USD", "channel": "mobile",
        "timestamp": ts.isoformat(), **extra,
    }  # fmt: skip


def test_score_persist_audit_and_graph(client: TestClient, owner_conn: psycopg.Connection) -> None:
    graph = client.app.state.container.graph  # type: ignore[attr-defined]
    run = uuid4().hex[:6]
    sender, mule = f"cust-{run}", f"mule-{run}"
    graph.run_write(
        "MERGE (a:Account {id: $id, tenantId: $t}) SET a.fraudRingId = 'ring-e2e'",
        id=mule, t=str(TENANT),
    )  # fmt: skip
    base = datetime.now(UTC) - timedelta(days=10)
    # Build a normal history (legit payee), then one suspicious transfer to the flagged mule.
    for i in range(8):
        r = client.post(
            "/v1/transactions/score", json=_tx(sender, "landlord", 100, base + timedelta(days=i))
        )
        assert r.status_code == 200, r.text
    benign = r.json()
    assert benign["score"]["status"] == "APPROVED"
    assert benign["graph_synced"] is True and benign["top_drivers"] == []

    risky = client.post(
        "/v1/transactions/score",
        json=_tx(sender, mule, 5000, datetime.now(UTC).replace(hour=3), deviceId=f"dev-{run}"),
    )
    assert risky.status_code == 200, risky.text
    body = risky.json()
    assert body["score"]["status"] in {"FLAGGED", "BLOCKED"}
    assert body["score"]["graph_status"] == "OK"
    assert body["fraud_ring_ids"] == ["ring-e2e"] and body["suspicious_accounts"] == [mule]
    assert len(body["top_drivers"]) == 5

    row = owner_conn.execute(
        "SELECT fraud_score, status, graph_hops, resolution, features_snap->>'graph_hops' "
        "FROM fraud_events WHERE id = %s",
        (body["fraud_event_id"],),
    ).fetchone()
    assert row is not None and row[1] == body["score"]["status"] and row[3] == "PENDING"
    assert row[2] == 1 and row[4] == "1"
    audit = owner_conn.execute(
        "SELECT count(*) FROM audit_log WHERE entity_id = %s AND event_type = 'SCORED'",
        (body["fraud_event_id"],),
    ).fetchone()
    assert audit == (1,)
    assert os.environ  # env-provided DSNs are used by the app settings
