"""Graph model and idempotent synchronization. Requires the Compose Neo4j."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from app.graph.client import GraphClient, GraphUnavailableError
from app.graph.models import TransactionEvent
from app.graph.schema import EXPECTED_CONSTRAINTS, apply_schema
from app.graph.seed import RING_ACCOUNTS, RING_DEVICE, SEED_TENANT_ID, apply_seed
from app.graph.sync import sync_transaction


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
    # Devices/IPs left with no account attached were created by this test.
    client.run_write("MATCH (n) WHERE (n:Device OR n:IPAddress) AND NOT (n)--() DELETE n")


def _event(tenant: UUID, **overrides: object) -> TransactionEvent:
    base: dict[str, object] = {
        "tenant_id": tenant,
        "transaction_id": uuid4(),
        "from_account_id": "a1",
        "to_account_id": "a2",
        "amount": 25.0,
        "currency": "USD",
        "channel": "mobile",
        "device_id": f"dev-{str(tenant)[:8]}-1",
        "ip_address": None,
        "timestamp": datetime(2026, 2, 1, 10, 0, tzinfo=UTC),
    }
    base.update(overrides)
    return TransactionEvent.model_validate(base)


def _counts(client: GraphClient, tenant: UUID, device_id: str | None = None) -> dict[str, int]:
    def _work(tx: object) -> dict[str, int]:
        record = tx.run(  # type: ignore[attr-defined]
            """
            OPTIONAL MATCH (a:Account {tenantId: $t})
            WITH count(DISTINCT a) AS accounts
            OPTIONAL MATCH (:Account {tenantId: $t})-[x:TRANSACTED_WITH]->(:Account)
            WITH accounts, count(DISTINCT x) AS transfers
            OPTIONAL MATCH (:Account {tenantId: $t})-[s:SHARES_DEVICE]->(d:Device {id: $dev})
            RETURN accounts, transfers, count(DISTINCT s) AS shares, count(DISTINCT d) AS devices
            """,
            t=str(tenant),
            dev=device_id,
        ).single()
        return dict(record)

    return client.read(_work)


def test_schema_constraints_exist(client: GraphClient) -> None:
    def _names(tx: object) -> set[str]:
        return {r["name"] for r in tx.run("SHOW CONSTRAINTS YIELD name")}  # type: ignore[attr-defined]

    assert EXPECTED_CONSTRAINTS <= client.read(_names)


def test_schema_is_idempotent(client: GraphClient) -> None:
    apply_schema(client)
    apply_schema(client)


def test_sync_creates_expected_structure(client: GraphClient, tenant: UUID) -> None:
    event = _event(tenant, ip_address="198.51.100.7")
    result = sync_transaction(client, event)
    # two accounts + one device are always new; the IP node may already exist (global key)
    assert result.nodes_created >= 3
    assert result.relationships_created == 3  # transfer, account->device, account->IP
    assert result.replayed is False
    device = event.device_id
    assert _counts(client, tenant, device) == {
        "accounts": 2,
        "transfers": 1,
        "shares": 1,
        "devices": 1,
    }


def test_replaying_same_event_changes_no_structure(client: GraphClient, tenant: UUID) -> None:
    event = _event(tenant)
    sync_transaction(client, event)
    before = _counts(client, tenant, event.device_id)
    second = sync_transaction(client, event)
    third = sync_transaction(client, event)
    assert _counts(client, tenant, event.device_id) == before
    assert second.replayed and third.replayed
    assert second.nodes_created == 0 and second.relationships_created == 0


def test_distinct_transactions_between_same_accounts_are_distinct_edges(
    client: GraphClient, tenant: UUID
) -> None:
    first = _event(tenant)
    second = _event(tenant, transaction_id=uuid4())
    sync_transaction(client, first)
    sync_transaction(client, second)
    counts = _counts(client, tenant, first.device_id)
    assert counts["accounts"] == 2
    assert counts["transfers"] == 2
    assert counts["shares"] == 1  # still one account->device edge


def test_missing_device_and_ip_are_skipped(client: GraphClient, tenant: UUID) -> None:
    event = _event(tenant, device_id=None, ip_address=None)
    result = sync_transaction(client, event)
    assert result.nodes_created == 2
    assert result.relationships_created == 1


def test_same_account_id_in_two_tenants_stays_separate(client: GraphClient, tenant: UUID) -> None:
    other = uuid4()
    try:
        sync_transaction(client, _event(tenant, device_id=None))
        sync_transaction(client, _event(other, device_id=None))
        assert _counts(client, tenant)["accounts"] == 2
        assert _counts(client, other)["accounts"] == 2
    finally:
        client.run_write("MATCH (a:Account {tenantId: $t}) DETACH DELETE a", t=str(other))


def test_accounts_share_device_node(client: GraphClient, tenant: UUID) -> None:
    shared = f"dev-{str(tenant)[:8]}-shared"
    sync_transaction(client, _event(tenant, from_account_id="x1", device_id=shared))
    sync_transaction(client, _event(tenant, from_account_id="x2", device_id=shared))
    assert _counts(client, tenant, shared)["devices"] == 1
    assert _counts(client, tenant, shared)["shares"] == 2


def test_seed_is_deterministic_and_idempotent(client: GraphClient) -> None:
    def _snapshot(tx: object) -> tuple[int, int, int]:
        r = tx.run(  # type: ignore[attr-defined]
            """
            MATCH (a:Account {tenantId: $t})
            WITH count(a) AS accounts
            MATCH (:Account {tenantId: $t})-[x:TRANSACTED_WITH]->()
            WITH accounts, count(x) AS transfers
            MATCH (:Account {tenantId: $t})-[s:SHARES_DEVICE]->(:Device {id: $d})
            RETURN accounts, transfers, count(s) AS ring_shares
            """,
            t=str(SEED_TENANT_ID),
            d=RING_DEVICE,
        ).single()
        return r["accounts"], r["transfers"], r["ring_shares"]

    apply_seed(client)
    first = client.read(_snapshot)
    apply_seed(client)
    assert client.read(_snapshot) == first
    assert first == (6, 7, len(RING_ACCOUNTS))
