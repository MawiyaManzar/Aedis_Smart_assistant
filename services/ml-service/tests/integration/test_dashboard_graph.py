"""Dashboard graph API against the real Neo4j seed graph (and a throwaway hub tenant)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from tests.integration.conftest import _app_url, _connect

from app.core.config import Settings
from app.graph.schema import apply_schema
from app.graph.seed import RING_ACCOUNTS, SEED_RING_ID, seed_events
from app.graph.sync import sync_transaction
from app.graph.view import GraphViewService
from app.main import create_app
from app.schemas.transaction import TransactionEvent

TENANT = UUID("00000000-0000-4000-8000-0000000000d3")


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    _connect(_app_url()).close()  # skip if the stack is down
    import os

    settings = Settings(
        database_url=_app_url(),
        redis_url=os.environ.get("REDIS_URL", "redis://localhost:6380/0"),
    )
    with TestClient(create_app(settings)) as c:
        graph = c.app.state.container.graph  # type: ignore[attr-defined]
        apply_schema(graph)
        # Replay the deterministic seed events into a private tenant so other data in the
        # shared seed tenant cannot affect assertions.
        for event in seed_events():
            sync_transaction(graph, event.model_copy(update={"tenant_id": TENANT}))
        graph.run_write(
            "MATCH (a:Account {tenantId: $t}) WHERE a.id IN $ids SET a.fraudRingId = $ring",
            t=str(TENANT),
            ids=list(RING_ACCOUNTS),
            ring=SEED_RING_ID,
        )
        yield c
        graph.run_write("MATCH (a:Account {tenantId: $t}) DETACH DELETE a", t=str(TENANT))
        graph.run_write("MATCH (n) WHERE (n:Device OR n:IPAddress) AND NOT (n)--() DELETE n")


def _get(c: TestClient, account: str, tenant: UUID = TENANT, **params: object):  # type: ignore[no-untyped-def]
    return c.get(f"/v1/dashboard/graph/{account}", params={"tenant_id": str(tenant), **params})


def _ids(body: dict, key: str) -> set[str]:  # type: ignore[type-arg]
    return {e["data"]["id"] for e in body[key]}


def test_ring_graph_is_cytoscape_shaped_and_flags_ring(client: TestClient) -> None:
    resp = _get(client, "mule-001", depth=1)
    assert resp.status_code == 200
    body = resp.json()
    nodes = {n["data"]["id"]: n["data"] for n in body["nodes"]}
    assert nodes["account:mule-001"]["isCenter"] is True
    assert nodes["account:mule-001"]["fraudRingId"] == SEED_RING_ID
    assert nodes["account:mule-002"]["flagged"] is True
    assert nodes["account:acct-001"]["flagged"] is False
    assert {"device:device-ring-001", "ip:203.0.113.50"} <= set(nodes)
    for edge in body["edges"]:
        d = edge["data"]
        assert d["source"] in nodes and d["target"] in nodes and d["id"] and d["type"]
    assert body["meta"]["depth"] == 1
    assert body["meta"]["truncated"] is False
    assert body["meta"]["flagged_accounts"] == 3


def test_depth_expands_neighbourhood(client: TestClient) -> None:
    d1 = _ids(_get(client, "acct-002", depth=1).json(), "nodes")
    d3 = _ids(_get(client, "acct-002", depth=3).json(), "nodes")
    assert d1 < d3
    assert "account:mule-003" in d3 and "account:mule-003" not in d1
    default = _get(client, "acct-002").json()
    assert default["meta"]["depth"] == 2


def test_distance_attribute_and_determinism(client: TestClient) -> None:
    first = _get(client, "acct-001", depth=2).json()
    second = _get(client, "acct-001", depth=2).json()
    assert first == second
    dist = {n["data"]["id"]: n["data"]["distance"] for n in first["nodes"]}
    assert dist["account:acct-001"] == 0 and dist["account:mule-001"] == 1
    assert dist["account:mule-002"] == 2


def test_unknown_account_and_other_tenant_are_404(client: TestClient) -> None:
    assert _get(client, "does-not-exist").status_code == 404
    other = _get(client, "mule-001", tenant=uuid4())
    assert other.status_code == 404
    assert other.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("depth", [0, 4, -1])
def test_depth_out_of_range_is_422(client: TestClient, depth: int) -> None:
    assert _get(client, "mule-001", depth=depth).status_code == 422


def test_missing_tenant_is_422(client: TestClient) -> None:
    assert client.get("/v1/dashboard/graph/mule-001").status_code == 422


def test_node_cap_truncates(client: TestClient) -> None:
    graph = client.app.state.container.graph  # type: ignore[attr-defined]
    tenant = uuid4()
    try:
        for i in range(12):
            sync_transaction(
                graph,
                TransactionEvent(
                    tenant_id=tenant,
                    transaction_id=uuid4(),
                    from_account_id="hub",
                    to_account_id=f"leaf-{i:02d}",
                    amount=10.0,
                    currency="USD",
                    channel="mobile",
                    timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                ),
            )
        service = GraphViewService(graph)
        view = service.neighbourhood(str(tenant), "hub", depth=1, node_cap=5)
        assert view is not None
        assert len(view.nodes) == 5 and view.meta["truncated"] is True
        full = service.neighbourhood(str(tenant), "hub", depth=1)
        assert full is not None and len(full.nodes) == 13 and full.meta["truncated"] is False
        with pytest.raises(ValueError):
            service.neighbourhood(str(tenant), "hub", depth=4)
    finally:
        graph.run_write("MATCH (a:Account {tenantId: $t}) DETACH DELETE a", t=str(tenant))


def test_graph_failure_is_503(client: TestClient) -> None:
    from app.graph.client import GraphUnavailableError

    container = client.app.state.container  # type: ignore[attr-defined]
    original = container.graph_view.neighbourhood

    def boom(*_a: object, **_k: object) -> None:
        raise GraphUnavailableError("down")

    container.graph_view.neighbourhood = boom
    try:
        resp = _get(client, "mule-001")
    finally:
        container.graph_view.neighbourhood = original
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "DEPENDENCY_UNAVAILABLE"
