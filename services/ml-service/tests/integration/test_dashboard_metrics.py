"""Dashboard metrics computed from real rows. Uses a fresh tenant (no audit rows written)."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from tests.integration.conftest import _app_url

from app.core.config import Settings
from app.main import create_app

NOW = datetime.now(UTC)


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app(
        Settings(
            require_models=False,
            database_url=_app_url(),
            redis_url=os.environ.get("REDIS_URL", "redis://localhost:6380/0"),
        )
    )
    with TestClient(app) as c:
        yield c


@pytest.fixture
def tenants(owner_conn: psycopg.Connection) -> Iterator[tuple[UUID, UUID]]:
    a, b = uuid4(), uuid4()
    for t in (a, b):
        owner_conn.execute("INSERT INTO tenants (id, name) VALUES (%s, 'metrics')", (t,))
    owner_conn.commit()
    yield a, b
    for t in (a, b):
        owner_conn.execute("DELETE FROM loan_distress_scores WHERE tenant_id = %s", (t,))
        owner_conn.execute("DELETE FROM fraud_events WHERE tenant_id = %s", (t,))
        owner_conn.execute("DELETE FROM transactions WHERE tenant_id = %s", (t,))
        owner_conn.execute("DELETE FROM borrowers WHERE tenant_id = %s", (t,))
        owner_conn.execute("DELETE FROM tenants WHERE id = %s", (t,))
    owner_conn.commit()


def _fraud(
    conn: psycopg.Connection,
    tenant: UUID,
    status: str,
    *,
    resolution: str = "PENDING",
    latency: float | None = None,
    graph: str = "OK",
    at: datetime = NOW,
) -> None:
    tx = uuid4()
    conn.execute(
        "INSERT INTO transactions (id, tenant_id, from_account_id, to_account_id, amount,"
        " currency, channel, occurred_at) VALUES (%s,%s,'a','b',10,'USD','web',%s)",
        (tx, tenant, at),
    )
    conn.execute(
        "INSERT INTO fraud_events (tenant_id, transaction_id, fraud_score, status, resolution,"
        " model_version, graph_status, inference_latency_ms, scored_at)"
        " VALUES (%s,%s,0.5,%s,%s,'m1',%s,%s,%s)",
        (tenant, tx, status, resolution, graph, latency, at),
    )


def _distress(
    conn: psycopg.Connection, tenant: UUID, borrower: UUID, band: str, at: datetime
) -> None:
    conn.execute(
        "INSERT INTO loan_distress_scores (tenant_id, borrower_id, distress_score, risk_band,"
        " model_version, features_snap, evaluated_at) VALUES (%s,%s,50,%s,'m1','{}',%s)",
        (tenant, borrower, band, at),
    )


def test_metrics_from_persisted_rows(
    client: TestClient, owner_conn: psycopg.Connection, tenants: tuple[UUID, UUID]
) -> None:
    a, b = tenants
    c = owner_conn
    _fraud(c, a, "APPROVED", latency=10)
    _fraud(c, a, "APPROVED", latency=20, graph="DEGRADED")
    _fraud(c, a, "FLAGGED", latency=30)
    _fraud(c, a, "BLOCKED", latency=40, resolution="CONFIRM_BLOCK")
    _fraud(c, a, "BLOCKED", resolution="ESCALATE", latency=None)
    _fraud(c, a, "BLOCKED", at=NOW - timedelta(days=3), latency=999)  # outside default window
    _fraud(c, b, "BLOCKED", latency=500)  # other tenant
    b1, b2 = uuid4(), uuid4()
    for bid in (b1, b2):
        c.execute("INSERT INTO borrowers (id, tenant_id) VALUES (%s,%s)", (bid, a))
    _distress(c, a, b1, "LOW", NOW - timedelta(hours=5))
    _distress(c, a, b1, "CRITICAL", NOW - timedelta(hours=1))  # latest for b1
    _distress(c, a, b2, "MEDIUM", NOW - timedelta(hours=2))
    c.commit()

    r = client.get("/v1/dashboard/metrics", params={"tenant_id": str(a)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fraud_events_total"] == 5
    assert body["fraud_events_by_status"] == {"approved": 2, "flagged": 1, "blocked": 2}
    assert body["flagged_blocked_rate"] == pytest.approx(3 / 5)
    assert body["resolutions"] == {"pending": 3, "resolved": 2}
    assert body["distress_by_risk_band"] == {"low": 0, "medium": 1, "high": 0, "critical": 1}
    assert body["graph_degraded_count"] == 1
    assert body["transactions_count"] == 5
    assert body["inference_latency_avg_ms"] == pytest.approx(25.0)
    # percentile_cont(0.95) over [10, 20, 30, 40] = 10 + 0.95*3*10 = 38.5
    assert body["inference_latency_p95_ms"] == pytest.approx(38.5)

    wide = client.get(
        "/v1/dashboard/metrics",
        params={"tenant_id": str(a), "since": (NOW - timedelta(days=7)).isoformat()},
    ).json()
    assert wide["fraud_events_total"] == 6
    assert wide["transactions_count"] == 6


def test_empty_tenant_returns_zeros_and_nulls(
    client: TestClient, tenants: tuple[UUID, UUID]
) -> None:
    r = client.get("/v1/dashboard/metrics", params={"tenant_id": str(tenants[1])})
    assert r.status_code == 200
    body = r.json()
    assert body["fraud_events_total"] == 0
    assert body["fraud_events_by_status"] == {"approved": 0, "flagged": 0, "blocked": 0}
    assert body["flagged_blocked_rate"] is None
    assert body["resolutions"] == {"pending": 0, "resolved": 0}
    assert body["distress_by_risk_band"] == {"low": 0, "medium": 0, "high": 0, "critical": 0}
    assert body["inference_latency_avg_ms"] is None
    assert body["inference_latency_p95_ms"] is None
    assert body["graph_degraded_count"] == 0
    assert body["transactions_count"] == 0
