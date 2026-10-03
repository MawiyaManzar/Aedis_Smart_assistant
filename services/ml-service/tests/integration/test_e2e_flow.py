"""M17 end-to-end flow against the live stack (Postgres + Redis + Neo4j + real model artifacts).

Everything goes through the real FastAPI app (``create_app(require_models=True)``). Data is
synthetic; nothing here says anything about real-bank performance and nothing asserts latency.

Tenants are permanent (``audit_log`` is append-only with an FK to ``tenants``). Mutable rows
(fraud_events, transactions, loan_distress_scores, borrowers), the Neo4j test-tenant nodes and the
Redis feature keys are removed before and after the module, so the test is re-runnable.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from neo4j import GraphDatabase
from redis import Redis
from tests.integration.conftest import _app_url, _connect, _owner_url

from app.core.config import Settings
from app.db.repositories import DistressScoreRepository
from app.features.distress import build_distress_features
from app.featurestore.borrower import BorrowerFeatureStore, feature_key
from app.main import create_app
from app.schemas.features import DistressFeatures, DistressFeatureSource

TENANT = UUID("00000000-0000-4000-8000-000000000e17")
DEGRADED_TENANT = UUID("00000000-0000-4000-8000-000000000e18")
RING = "ring-m17"
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6380/0")


def _settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "require_models": True,
        "database_url": _app_url(),
        "redis_url": REDIS_URL,
    }
    if "NEO4J_URI" in os.environ:
        base["neo4j_uri"] = os.environ["NEO4J_URI"]
    return Settings(**{**base, **overrides})


def _purge_postgres(conn: psycopg.Connection) -> None:
    for tenant in (TENANT, DEGRADED_TENANT):
        conn.execute("DELETE FROM loan_distress_scores WHERE tenant_id = %s", (tenant,))
        conn.execute("DELETE FROM fraud_events WHERE tenant_id = %s", (tenant,))
        conn.execute("DELETE FROM transactions WHERE tenant_id = %s", (tenant,))
        conn.execute("DELETE FROM borrowers WHERE tenant_id = %s", (tenant,))
    conn.commit()


def _purge_graph(client: TestClient) -> None:
    graph = client.app.state.container.graph  # type: ignore[attr-defined]
    for tenant in (TENANT, DEGRADED_TENANT):
        graph.run_write("MATCH (a:Account {tenantId: $t}) DETACH DELETE a", t=str(tenant))
    graph.run_write("MATCH (n) WHERE (n:Device OR n:IPAddress) AND NOT (n)--() DELETE n")


def _tx(
    sender: str,
    receiver: str,
    amount: float,
    ts: datetime,
    tenant: UUID = TENANT,
    **extra: object,
) -> dict[str, object]:
    return {
        "tenantId": str(tenant), "transactionId": str(uuid4()), "fromAccountId": sender,
        "toAccountId": receiver, "amount": amount, "currency": "USD", "channel": "mobile",
        "timestamp": ts.isoformat(), **extra,
    }  # fmt: skip


@dataclass
class Flow:
    client: TestClient
    owner: psycopg.Connection
    run: str
    sender: str
    mule: str
    benign: dict[str, Any] = field(default_factory=dict)
    risky_payload: dict[str, object] = field(default_factory=dict)
    risky: dict[str, Any] = field(default_factory=dict)
    replay: dict[str, Any] = field(default_factory=dict)
    counts_before_replay: dict[str, int] = field(default_factory=dict)
    counts_after_replay: dict[str, int] = field(default_factory=dict)
    since: datetime = field(default_factory=lambda: datetime.now(UTC) - timedelta(days=11))

    @property
    def event_id(self) -> str:
        return str(self.risky["fraud_event_id"])

    @property
    def tx_id(self) -> str:
        return str(self.risky_payload["transactionId"])


def _counts(conn: psycopg.Connection, tx_id: str) -> dict[str, int]:
    conn.rollback()
    out: dict[str, int] = {}
    for name, sql in {
        "transactions": "SELECT count(*) FROM transactions WHERE id = %s",
        "fraud_events": "SELECT count(*) FROM fraud_events WHERE transaction_id = %s",
    }.items():
        row = conn.execute(sql, (tx_id,)).fetchone()
        assert row is not None
        out[name] = int(row[0])
    return out


@pytest.fixture(scope="module")
def owner() -> Iterator[psycopg.Connection]:
    conn = _connect(_owner_url())
    for tenant, name in ((TENANT, "m17-e2e"), (DEGRADED_TENANT, "m17-e2e-degraded")):
        conn.execute(
            "INSERT INTO tenants (id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING", (tenant, name)
        )
    conn.commit()
    _purge_postgres(conn)
    yield conn
    _purge_postgres(conn)
    conn.close()


@pytest.fixture(scope="module")
def client(owner: psycopg.Connection) -> Iterator[TestClient]:
    with TestClient(create_app(_settings())) as c:
        _purge_graph(c)
        yield c
        _purge_graph(c)


@pytest.fixture(scope="module")
def flow(client: TestClient, owner: psycopg.Connection) -> Flow:
    run = uuid4().hex[:6]
    f = Flow(client=client, owner=owner, run=run, sender=f"cust-{run}", mule=f"mule-{run}")
    graph = client.app.state.container.graph  # type: ignore[attr-defined]
    graph.run_write(
        "MERGE (a:Account {id: $id, tenantId: $t}) SET a.fraudRingId = $ring",
        id=f.mule, t=str(TENANT), ring=RING,
    )  # fmt: skip
    base = datetime.now(UTC) - timedelta(days=10)
    for i in range(8):
        r = client.post(
            "/v1/transactions/score",
            json=_tx(f.sender, "landlord", 100, base + timedelta(days=i)),
        )
        assert r.status_code == 200, r.text
        f.benign = r.json()
    f.risky_payload = _tx(
        f.sender, f.mule, 5000, datetime.now(UTC).replace(hour=3, minute=0), deviceId=f"dev-{run}"
    )
    r = client.post("/v1/transactions/score", json=f.risky_payload)
    assert r.status_code == 200, r.text
    f.risky = r.json()

    # (c) replay the identical payload
    f.counts_before_replay = _counts(owner, f.tx_id)
    r = client.post("/v1/transactions/score", json=f.risky_payload)
    assert r.status_code == 200, r.text
    f.replay = r.json()
    f.counts_after_replay = _counts(owner, f.tx_id)
    return f


def test_a_normal_history_is_approved(flow: Flow) -> None:
    assert flow.benign["score"]["status"] == "APPROVED"
    assert flow.benign["score"]["graph_status"] == "OK"
    assert flow.benign["graph_synced"] is True
    assert flow.benign["top_drivers"] == []
    row = flow.owner.execute(
        "SELECT count(*) FROM fraud_events WHERE tenant_id = %s AND status = 'APPROVED'", (TENANT,)
    ).fetchone()
    assert row is not None and row[0] >= 8


def test_b_transfer_to_ring_account_is_flagged_and_persisted(flow: Flow) -> None:
    body, owner = flow.risky, flow.owner
    assert body["score"]["status"] in {"FLAGGED", "BLOCKED"}
    assert body["score"]["graph_status"] == "OK"
    assert body["fraud_ring_ids"] == [RING] and body["suspicious_accounts"] == [flow.mule]
    assert body["graph_synced"] is True
    assert len(body["top_drivers"]) == 5
    for d in body["top_drivers"]:
        assert isinstance(d["shap_contribution"], int | float) and d["feature"]

    owner.rollback()
    row = owner.execute(
        "SELECT status, graph_status, graph_hops, resolution, fraud_ring_ids "
        "FROM fraud_events WHERE id = %s AND tenant_id = %s",
        (flow.event_id, TENANT),
    ).fetchone()
    assert row is not None
    assert row[0] == body["score"]["status"] and row[1] == "OK" and row[3] == "PENDING"
    assert row[2] == 1 and RING in row[4]
    tx = owner.execute(
        "SELECT from_account_id, to_account_id FROM transactions WHERE id = %s AND tenant_id = %s",
        (flow.tx_id, TENANT),
    ).fetchone()
    assert tx == (flow.sender, flow.mule)
    scored = owner.execute(
        "SELECT payload->>'status' FROM audit_log WHERE entity_id = %s AND event_type = 'SCORED'"
        " ORDER BY created_at",
        (flow.event_id,),
    ).fetchall()
    assert scored and scored[0][0] == body["score"]["status"]

    graph = flow.client.app.state.container.graph  # type: ignore[attr-defined]
    edges = graph.read(
        lambda tx_, **kw: [
            r["n"]
            for r in tx_.run(
                "MATCH (:Account {id: $f, tenantId: $t})-[r:TRANSACTED_WITH {transactionId: $x}]"
                "->(:Account {id: $m, tenantId: $t}) RETURN count(r) AS n",
                **kw,
            )
        ],
        f=flow.sender, m=flow.mule, t=str(TENANT), x=flow.tx_id,
    )  # fmt: skip
    assert edges == [1]


def test_c_replay_is_idempotent(flow: Flow) -> None:
    assert flow.counts_before_replay == {"transactions": 1, "fraud_events": 1}
    assert flow.counts_after_replay == {"transactions": 1, "fraud_events": 1}
    assert flow.replay["fraud_event_id"] == flow.risky["fraud_event_id"]
    assert flow.replay["graph_synced"] is True
    graph = flow.client.app.state.container.graph  # type: ignore[attr-defined]
    edges = graph.read(
        lambda tx_, **kw: [
            r["n"]
            for r in tx_.run(
                "MATCH ()-[r:TRANSACTED_WITH {transactionId: $x}]->() RETURN count(r) AS n", **kw
            )
        ],
        x=flow.tx_id,
    )
    assert edges == [1]
    # The graph write for the replay was a no-op (no new nodes/edges): counted as "replayed".
    counts = flow.client.app.state.container.graph_sync.counts  # type: ignore[attr-defined]
    assert counts["replayed"] >= 1


def test_d_dashboard_graph_shows_transfer_edge(flow: Flow) -> None:
    r = flow.client.get(
        f"/v1/dashboard/graph/{flow.mule}", params={"tenant_id": str(TENANT), "depth": 1}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    nodes = {n["data"]["id"]: n["data"] for n in body["nodes"]}
    assert nodes[f"account:{flow.mule}"]["isCenter"] is True
    assert nodes[f"account:{flow.mule}"]["fraudRingId"] == RING
    assert nodes[f"account:{flow.sender}"]["flagged"] is False
    transfer = [e["data"] for e in body["edges"] if e["data"]["id"] == flow.tx_id]
    assert len(transfer) == 1
    assert transfer[0]["type"] == "TRANSACTED_WITH"
    assert transfer[0]["source"] == f"account:{flow.sender}"
    assert transfer[0]["target"] == f"account:{flow.mule}"


def test_e_metrics_match_direct_sql(flow: Flow) -> None:
    flow.owner.rollback()
    sql = flow.owner.execute(
        "SELECT count(*), count(*) FILTER (WHERE status='APPROVED'),"
        " count(*) FILTER (WHERE status='FLAGGED'), count(*) FILTER (WHERE status='BLOCKED'),"
        " count(*) FILTER (WHERE graph_status='DEGRADED') FROM fraud_events"
        " WHERE tenant_id = %s AND scored_at >= %s",
        (TENANT, flow.since),
    ).fetchone()
    tx_count = flow.owner.execute(
        "SELECT count(*) FROM transactions WHERE tenant_id = %s AND occurred_at >= %s",
        (TENANT, flow.since),
    ).fetchone()
    assert sql is not None and tx_count is not None
    r = flow.client.get(
        "/v1/dashboard/metrics", params={"tenant_id": str(TENANT), "since": flow.since.isoformat()}
    )
    assert r.status_code == 200, r.text
    m = r.json()
    assert sql[0] == 9  # 8 history events + 1 ring transfer; the replay added none
    assert m["fraud_events_total"] == sql[0]
    assert m["fraud_events_by_status"] == {
        "approved": sql[1], "flagged": sql[2], "blocked": sql[3]
    }  # fmt: skip
    assert m["fraud_events_by_status"]["approved"] >= 8
    assert m["fraud_events_by_status"]["flagged"] + m["fraud_events_by_status"]["blocked"] == 1
    assert m["graph_degraded_count"] == sql[4] == 0
    assert m["transactions_count"] == tx_count[0] == 9


def test_f_resolve_flow(flow: Flow) -> None:
    def post(resolution: str, by: str = "analyst-m17") -> Any:
        return flow.client.post(
            f"/v1/alerts/{flow.event_id}/resolve",
            json={"tenant_id": str(TENANT), "resolution": resolution, "resolved_by": by},
        )

    def resolved_audits() -> int:
        flow.owner.rollback()
        row = flow.owner.execute(
            "SELECT count(*) FROM audit_log WHERE entity_id = %s AND event_type = 'RESOLVED'",
            (flow.event_id,),
        ).fetchone()
        assert row is not None
        return int(row[0])

    assert resolved_audits() == 0
    first = post("CONFIRM_BLOCK")
    assert first.status_code == 200, first.text
    assert first.json()["previous_resolution"] == "PENDING" and first.json()["changed"] is True

    illegal = post("OVERRIDE_APPROVE")
    assert illegal.status_code == 409
    assert illegal.json()["error"]["code"] == "CONFLICT"

    again = post("CONFIRM_BLOCK", by="someone-else")
    assert again.status_code == 200 and again.json()["changed"] is False
    assert again.json()["resolved_at"] == first.json()["resolved_at"]
    assert again.json()["resolved_by"] == "analyst-m17"

    assert resolved_audits() == 1
    flow.owner.rollback()
    row = flow.owner.execute(
        "SELECT resolution, resolved_by FROM fraud_events WHERE id = %s", (flow.event_id,)
    ).fetchone()
    assert row == ("CONFIRM_BLOCK", "analyst-m17")
    payload = flow.owner.execute(
        "SELECT payload FROM audit_log WHERE entity_id = %s AND event_type = 'RESOLVED'",
        (flow.event_id,),
    ).fetchone()
    assert payload is not None and payload[0]["from"] == "PENDING"
    assert payload[0]["to"] == "CONFIRM_BLOCK"

    # A second alert takes the other legal branch: PENDING -> OVERRIDE_APPROVE.
    other = flow.client.post(
        "/v1/transactions/score",
        json=_tx(flow.sender, flow.mule, 4000, datetime.now(UTC).replace(hour=2, minute=0)),
    )
    assert other.status_code == 200, other.text
    other_id = other.json()["fraud_event_id"]
    if other.json()["score"]["status"] != "APPROVED":  # only meaningful if it created an alert
        r = flow.client.post(
            f"/v1/alerts/{other_id}/resolve",
            json={
                "tenant_id": str(TENANT),
                "resolution": "OVERRIDE_APPROVE",
                "resolved_by": "analyst-m17",
            },
        )
        assert r.status_code == 200 and r.json()["resolution"] == "OVERRIDE_APPROVE"

    m = flow.client.get(
        "/v1/dashboard/metrics", params={"tenant_id": str(TENANT), "since": flow.since.isoformat()}
    ).json()
    assert m["resolutions"]["resolved"] >= 1


def test_g_degraded_graph_still_persists(
    owner: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Unreachable Neo4j (nothing listens on port 1). The driver would retry every call for ~30s
    # by default (minutes in total), so cap its transaction retry time for this app only. Bad
    # credentials are deliberately not used: they trip Neo4j's auth rate limiter for later tests.
    real_driver = GraphDatabase.driver
    monkeypatch.setattr(
        "app.graph.client.GraphDatabase.driver",
        lambda *a, **kw: real_driver(*a, max_transaction_retry_time=0.5, **kw),
    )
    settings = _settings(neo4j_uri="bolt://127.0.0.1:1", readiness_timeout_seconds=1.0)
    payload = _tx(
        f"cust-{uuid4().hex[:6]}", "landlord", 100, datetime.now(UTC), tenant=DEGRADED_TENANT
    )
    with TestClient(create_app(settings)) as degraded:
        r = degraded.post("/v1/transactions/score", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["score"]["graph_status"] == "DEGRADED"
    assert body["graph_synced"] is False  # sync failed, but the result is durable
    owner.rollback()
    row = owner.execute(
        "SELECT graph_status, graph_hops FROM fraud_events WHERE id = %s AND tenant_id = %s",
        (body["fraud_event_id"], DEGRADED_TENANT),
    ).fetchone()
    assert row == ("DEGRADED", -1)
    assert owner.execute(
        "SELECT count(*) FROM transactions WHERE id = %s", (payload["transactionId"],)
    ).fetchone() == (1,)
    assert owner.execute(
        "SELECT count(*) FROM audit_log WHERE entity_id = %s AND event_type = 'SCORED'",
        (body["fraud_event_id"],),
    ).fetchone() == (1,)


def _source(label: str, deteriorating: bool) -> DistressFeatureSource:
    return DistressFeatureSource(
        borrower_id=uuid4(),
        avg_balance_60d=6000.0,
        avg_balance_30d=2400.0 if deteriorating else 6100.0,
        atm_28d=400.0,
        atm_14d=340.0 if deteriorating else 200.0,
        new_high_interest_count=3 if deteriorating else 0,
    )


def test_h_distress_path_to_metrics(client: TestClient, owner: psycopg.Connection) -> None:
    sources = [_source("healthy", False), _source("deteriorating", True)]
    features: dict[UUID, DistressFeatures] = {
        s.borrower_id: build_distress_features(s) for s in sources
    }
    ids = list(features)
    redis = Redis.from_url(REDIS_URL, socket_connect_timeout=2)
    try:
        for bid in ids:
            owner.execute(
                "INSERT INTO borrowers (id, tenant_id, external_ref) VALUES (%s, %s, 'm17')",
                (bid, TENANT),
            )
        owner.commit()

        store = BorrowerFeatureStore(redis)
        assert store.put_many(features) == 2
        loaded = store.get_many(ids)
        assert loaded == features

        r = client.post(
            "/v1/models/distress/score-batch",
            json={
                "evaluation_date": date.today().isoformat(),
                "borrowers": [
                    {"borrower_id": str(b), "features": f.model_dump()} for b, f in loaded.items()
                ],
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        by_id = {UUID(s["borrower_id"]): s for s in body["scores"]}
        assert set(by_id) == set(ids)

        repo = DistressScoreRepository()
        engine = client.app.state.container.engine  # type: ignore[attr-defined]
        now = datetime.now(UTC)
        with engine.begin() as conn:
            for bid in ids:
                repo.insert(
                    conn,
                    tenant_id=TENANT,
                    borrower_id=bid,
                    distress_score=by_id[bid]["distress_score"],
                    risk_band=by_id[bid]["risk_band"],
                    model_version=body["model_version"],
                    features=loaded[bid].model_dump(),
                    evaluated_at=now,
                )

        owner.rollback()
        rows = owner.execute(
            "SELECT borrower_id, distress_score, risk_band FROM loan_distress_scores "
            "WHERE tenant_id = %s",
            (TENANT,),
        ).fetchall()
        assert {(r_[0], r_[1], r_[2]) for r_ in rows} == {
            (b, by_id[b]["distress_score"], by_id[b]["risk_band"]) for b in ids
        }
        expected = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        for b in ids:
            expected[by_id[b]["risk_band"].lower()] += 1

        m = client.get(
            "/v1/dashboard/metrics",
            params={"tenant_id": str(TENANT), "since": (now - timedelta(hours=1)).isoformat()},
        ).json()
        assert m["distress_by_risk_band"] == expected
    finally:
        redis.delete(*[feature_key(b) for b in ids])
        redis.close()
