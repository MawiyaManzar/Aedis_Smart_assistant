"""Cross-check Cypher enrichment against the pure-Python reference semantics."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from app.features.config import GRAPH_HOPS_UNKNOWN, GRAPH_MAX_HOPS, GRAPH_NO_CONNECTION
from app.graph.client import GraphClient, GraphUnavailableError
from app.graph.queries import GraphEnricher
from app.graph.reference import Node, account, transaction_hops
from app.graph.schema import apply_schema
from app.graph.sync import sync_transaction
from app.schemas.transaction import TransactionEvent


@pytest.fixture(scope="module")
def client() -> Iterator[GraphClient]:
    graph = GraphClient(
        os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
        os.environ.get("NEO4J_USER", "neo4j"),
        os.environ.get("NEO4J_PASSWORD", "aedis_password"),
        connection_timeout=3,
    )
    try:
        graph.verify()
    except GraphUnavailableError:
        graph.close()
        if os.environ.get("AEDIS_REQUIRE_INTEGRATION") == "1":
            raise
        pytest.skip("Neo4j not reachable")
    apply_schema(graph)
    yield graph
    graph.close()


@pytest.fixture
def tenant(client: GraphClient) -> Iterator[UUID]:
    tenant_id = uuid4()
    yield tenant_id
    client.run_write("MATCH (a:Account {tenantId: $t}) DETACH DELETE a", t=str(tenant_id))
    client.run_write("MATCH (n) WHERE (n:Device OR n:IPAddress) AND NOT (n)--() DELETE n")


def _send(client: GraphClient, tenant: UUID, a: str, b: str, device: str | None = None) -> None:
    sync_transaction(
        client,
        TransactionEvent(
            tenant_id=tenant,
            transaction_id=uuid4(),
            from_account_id=a,
            to_account_id=b,
            amount=10,
            currency="USD",
            channel="web",
            device_id=device,
            timestamp=datetime.now(UTC),
        ),  # fmt: skip
    )


def test_enrichment_matches_reference(client: GraphClient, tenant: UUID) -> None:
    dev = f"dev-{tenant}"
    edges = [("m1", "m2"), ("v1", "m1"), ("v2", "v1"), ("v3", "v2"), ("v4", "v3")]
    for a, b in edges:
        _send(client, tenant, a, b)
    _send(client, tenant, "d1", "x1", device=dev)
    _send(client, tenant, "m2", "x2", device=dev)  # d1 shares a device with flagged m2
    client.run_write(
        "MATCH (a:Account {tenantId: $t}) WHERE a.id IN ['m1','m2'] SET a.fraudRingId = 'r1'",
        t=str(tenant),
    )
    adjacency: dict[Node, set[Node]] = {}

    def link(x: Node, y: Node) -> None:
        adjacency.setdefault(x, set()).add(y)
        adjacency.setdefault(y, set()).add(x)

    for a, b in edges + [("d1", "x1"), ("m2", "x2")]:
        link(account(a), account(b))
    link(account("d1"), ("dev", dev))
    link(account("m2"), ("dev", dev))
    flagged = {account("m1"), account("m2")}

    enricher = GraphEnricher(client)
    cases = [("m1", "v4"), ("v1", "v4"), ("v3", "v4"), ("v4", "v3"), ("d1", "zz"),
             ("v4", "v4"), ("nobody", "x1"), ("v4", "m2")]  # fmt: skip
    for sender, beneficiary in cases:
        expected = transaction_hops(
            adjacency, flagged, sender, beneficiary, GRAPH_MAX_HOPS, GRAPH_NO_CONNECTION
        )
        got = enricher.enrich(str(tenant), sender, beneficiary)
        assert got.status == "OK"
        assert got.graph_hops == expected, (sender, beneficiary)


def test_unreachable_graph_is_degraded() -> None:
    dead = GraphClient("bolt://127.0.0.1:1", "neo4j", "x", connection_timeout=0.5)
    result = GraphEnricher(dead, timeout_seconds=0.2).enrich("t", "a", "b")
    dead.close()
    assert result.status == "DEGRADED" and result.graph_hops == GRAPH_HOPS_UNKNOWN
