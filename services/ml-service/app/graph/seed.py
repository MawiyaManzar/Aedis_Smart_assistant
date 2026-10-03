"""Small deterministic graph used to verify the environment and in tests.

Fixed UUIDs and timestamps: running the seed twice yields exactly the same graph.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid5

from neo4j import ManagedTransaction

from app.graph.client import GraphClient
from app.graph.sync import sync_transaction
from app.schemas.transaction import TransactionEvent

SEED_TENANT_ID = UUID("00000000-0000-4000-8000-0000000000a1")
SEED_RING_ID = "ring-seed-001"
RING_ACCOUNTS = ("mule-001", "mule-002", "mule-003")
RING_DEVICE = "device-ring-001"
RING_IP = "203.0.113.50"
_NAMESPACE = UUID("00000000-0000-4000-8000-00000000feed")
_BASE_TIME = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _event(index: int, source: str, target: str, **extra: str | None) -> TransactionEvent:
    return TransactionEvent(
        tenant_id=SEED_TENANT_ID,
        transaction_id=uuid5(_NAMESPACE, f"seed-{index}"),
        from_account_id=source,
        to_account_id=target,
        amount=100.0 + index,
        currency="USD",
        channel="mobile",
        device_id=extra.get("device_id"),
        ip_address=extra.get("ip_address"),
        timestamp=_BASE_TIME + timedelta(minutes=index),
    )


def seed_events() -> list[TransactionEvent]:
    """Ordinary customers plus a three-account mule ring sharing a device and an IP."""
    events: list[TransactionEvent] = []
    ordinary = [("acct-001", "acct-002"), ("acct-002", "acct-003"), ("acct-003", "acct-001")]
    for position, (source, target) in enumerate(ordinary):
        events.append(
            _event(position, source, target, device_id=f"device-{source}", ip_address=None)
        )
    ring_pairs = [
        ("mule-001", "mule-002"),
        ("mule-002", "mule-003"),
        ("mule-003", "mule-001"),
    ]
    for offset, (source, target) in enumerate(ring_pairs, start=len(events)):
        events.append(_event(offset, source, target, device_id=RING_DEVICE, ip_address=RING_IP))
    events.append(
        _event(len(events), "acct-001", "mule-001", device_id="device-acct-001", ip_address=None)
    )
    return events


def apply_seed(client: GraphClient) -> int:
    """Sync the seed events and flag the ring accounts. Returns the event count."""
    events = seed_events()
    for event in events:
        sync_transaction(client, event)

    def _flag(tx: ManagedTransaction) -> None:
        tx.run(
            "MATCH (a:Account {tenantId: $tenant}) WHERE a.id IN $ids SET a.fraudRingId = $ring",
            tenant=str(SEED_TENANT_ID),
            ids=list(RING_ACCOUNTS),
            ring=SEED_RING_ID,
        ).consume()

    client.write(_flag)
    return len(events)
