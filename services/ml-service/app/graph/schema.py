"""Neo4j constraints and indexes. This module is the single definition of the graph schema."""

from __future__ import annotations

from app.graph.client import GraphClient

SCHEMA_STATEMENTS: tuple[str, ...] = (
    "CREATE CONSTRAINT account_id_tenant_unique IF NOT EXISTS "
    "FOR (a:Account) REQUIRE (a.id, a.tenantId) IS UNIQUE",
    "CREATE CONSTRAINT device_id_unique IF NOT EXISTS FOR (d:Device) REQUIRE d.id IS UNIQUE",
    "CREATE CONSTRAINT ip_address_unique IF NOT EXISTS FOR (i:IPAddress) REQUIRE i.ip IS UNIQUE",
    "CREATE INDEX account_fraud_ring_id IF NOT EXISTS FOR (a:Account) ON (a.fraudRingId)",
    "CREATE INDEX transacted_with_tx_id IF NOT EXISTS "
    "FOR ()-[t:TRANSACTED_WITH]-() ON (t.transactionId)",
)

EXPECTED_CONSTRAINTS = frozenset(
    {"account_id_tenant_unique", "device_id_unique", "ip_address_unique"}
)


def apply_schema(client: GraphClient) -> None:
    """Create constraints and indexes. Safe to run repeatedly."""
    for statement in SCHEMA_STATEMENTS:
        client.run_write(statement)
