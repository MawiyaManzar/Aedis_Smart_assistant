"""Idempotent transaction -> graph synchronization.

Graph model (all relationships point away from the account):

    (Account)-[:TRANSACTED_WITH {transactionId}]->(Account)
    (Account)-[:SHARES_DEVICE]->(Device)
    (Account)-[:SHARES_IP]->(IPAddress)

Two accounts "share" a device or IP when they point at the same Device/IPAddress node.
Replaying an event creates nothing new: nodes and ``SHARES_*`` edges are MERGEd on their
natural keys and each ``TRANSACTED_WITH`` edge is keyed by ``transactionId``.
"""

from __future__ import annotations

import time
from typing import Any

from neo4j import ManagedTransaction

from app.graph.client import GraphClient
from app.graph.models import SyncResult, TransactionEvent

_ACCOUNTS_AND_TRANSFER = """
MERGE (a:Account {id: $from_id, tenantId: $tenant_id})
MERGE (b:Account {id: $to_id, tenantId: $tenant_id})
MERGE (a)-[t:TRANSACTED_WITH {transactionId: $transaction_id}]->(b)
  ON CREATE SET t.amount = $amount, t.currency = $currency, t.channel = $channel,
                t.occurredAt = datetime($occurred_at)
"""

_DEVICE = """
MATCH (a:Account {id: $from_id, tenantId: $tenant_id})
MERGE (d:Device {id: $device_id})
  ON CREATE SET d.firstSeen = datetime($occurred_at)
SET d.firstSeen = CASE WHEN datetime($occurred_at) < d.firstSeen
                       THEN datetime($occurred_at) ELSE d.firstSeen END
MERGE (a)-[r:SHARES_DEVICE]->(d)
  ON CREATE SET r.firstSeen = datetime($occurred_at)
"""

_IP = """
MATCH (a:Account {id: $from_id, tenantId: $tenant_id})
MERGE (i:IPAddress {ip: $ip})
  ON CREATE SET i.firstSeen = datetime($occurred_at)
SET i.firstSeen = CASE WHEN datetime($occurred_at) < i.firstSeen
                       THEN datetime($occurred_at) ELSE i.firstSeen END
MERGE (a)-[r:SHARES_IP]->(i)
  ON CREATE SET r.firstSeen = datetime($occurred_at)
"""


def _params(event: TransactionEvent) -> dict[str, Any]:
    return {
        "tenant_id": str(event.tenant_id),
        "transaction_id": str(event.transaction_id),
        "from_id": event.from_account_id,
        "to_id": event.to_account_id,
        "amount": event.amount,
        "currency": event.currency,
        "channel": event.channel,
        "occurred_at": event.timestamp.isoformat(),
        "device_id": event.device_id,
        "ip": event.ip_address,
    }


def _write_event(tx: ManagedTransaction, event: TransactionEvent) -> tuple[int, int, int]:
    params = _params(event)
    queries = [_ACCOUNTS_AND_TRANSFER]
    if event.device_id:
        queries.append(_DEVICE)
    if event.ip_address:
        queries.append(_IP)
    nodes = rels = props = 0
    for query in queries:
        counters = tx.run(query, **params).consume().counters
        nodes += counters.nodes_created
        rels += counters.relationships_created
        props += counters.properties_set
    return nodes, rels, props


def sync_transaction(client: GraphClient, event: TransactionEvent) -> SyncResult:
    """Write one transaction into Neo4j in a single transaction. Idempotent."""
    started = time.perf_counter()
    nodes, rels, props = client.write(_write_event, event)
    return SyncResult(
        transaction_id=event.transaction_id,
        nodes_created=nodes,
        relationships_created=rels,
        properties_set=props,
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
        replayed=(nodes == 0 and rels == 0),
    )
