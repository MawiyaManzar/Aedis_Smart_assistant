"""Deterministic scam-ring demo against a running ML service (synthetic data only).

Usage (from services/ml-service)::

    uv run python scripts/demo_scam_ring.py [BASE_URL]      # default http://localhost:8000

Steps: ensure the demo tenant -> flag the seed mule ring in Neo4j -> replay each victim's normal
history through ``POST /v1/transactions/score`` -> send suspicious transfers into the ring ->
print what the service really returned. Re-runnable: ids, timestamps and amounts are fixed, and
every write is idempotent (a re-run re-scores the same transactions).
"""

from __future__ import annotations

import random
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

sys.path.insert(0, str(Path(__file__).resolve().parent))

from demo_common import (  # noqa: E402
    EXIT_DEPENDENCY,
    DemoError,
    admin_database_url,
    base_url,
    ensure_tenant,
    fail,
    load_root_env,
    plain_dsn,
    post_or_fail,
    require_service,
)

from app.graph.seed import (  # noqa: E402
    RING_ACCOUNTS,
    RING_DEVICE,
    RING_IP,
    SEED_RING_ID,
    SEED_TENANT_ID,
)
from app.schemas.transaction import TransactionEvent  # noqa: E402

DEMO_TENANT_ID = SEED_TENANT_ID  # graph flags from apply_seed live under this tenant
NAMESPACE = UUID("00000000-0000-4000-8000-00000000d3a0")
RNG_SEED = 20260201
BASE_TIME = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)  # attack day; history is before this
VICTIMS = ("victim-001", "victim-002", "victim-003")
HISTORY_DAYS = 20
HISTORY_PER_VICTIM = 12


@dataclass(frozen=True)
class ProbeStep:
    label: str
    event: TransactionEvent


@dataclass(frozen=True)
class Scenario:
    history: list[TransactionEvent]
    probes: list[ProbeStep]


def _tx_id(name: str) -> UUID:
    return uuid5(NAMESPACE, name)


def _event(
    name: str,
    source: str,
    target: str,
    amount: float,
    timestamp: datetime,
    channel: str,
    device_id: str | None,
    ip_address: str | None,
) -> TransactionEvent:
    return TransactionEvent(
        tenant_id=DEMO_TENANT_ID,
        transaction_id=_tx_id(name),
        from_account_id=source,
        to_account_id=target,
        amount=amount,
        currency="USD",
        channel=channel,
        device_id=device_id,
        ip_address=ip_address,
        timestamp=timestamp,
    )


def build_scenario() -> Scenario:
    """Pure and deterministic: the same call always returns identical events."""
    rng = random.Random(RNG_SEED)
    history: list[TransactionEvent] = []
    for number, victim in enumerate(VICTIMS, start=1):
        merchants = [f"merchant-{number}-{k}" for k in range(2)]
        for i in range(HISTORY_PER_VICTIM):
            day = (i * HISTORY_DAYS) // HISTORY_PER_VICTIM + 1  # 1..20 days before attack day
            when = BASE_TIME - timedelta(days=day, hours=-(13 + rng.randrange(0, 4)))
            history.append(
                _event(
                    f"history-{victim}-{i}",
                    victim,
                    merchants[i % 2],
                    round(rng.uniform(25.0, 90.0), 2),
                    when + timedelta(minutes=rng.randrange(0, 60)),
                    "mobile",
                    f"device-{victim}",
                    None,
                )
            )
    probes: list[ProbeStep] = []
    for number, victim in enumerate(VICTIMS, start=1):
        probes.append(
            ProbeStep(
                f"{victim}: ordinary payment to a known merchant (control)",
                _event(
                    f"probe-{victim}-control",
                    victim,
                    f"merchant-{number}-0",
                    round(rng.uniform(25.0, 90.0), 2),
                    BASE_TIME + timedelta(hours=14, minutes=number),
                    "mobile",
                    f"device-{victim}",
                    None,
                ),
            )
        )
        for k, mule in enumerate(RING_ACCOUNTS[:2]):
            probes.append(
                ProbeStep(
                    f"{victim}: 3am transfer to ring account {mule} from the ring's device",
                    _event(
                        f"probe-{victim}-ring-{k}",
                        victim,
                        mule,
                        round(4500.0 + 250.0 * number + 120.0 * k, 2),
                        BASE_TIME + timedelta(hours=3, minutes=10 * number + k),
                        "web",
                        RING_DEVICE,
                        RING_IP,
                    ),
                )
            )
    return Scenario(history=history, probes=probes)


def wire(event: TransactionEvent) -> dict[str, Any]:
    """camelCase JSON body exactly as the gateway sends it."""
    return event.model_dump(mode="json", by_alias=True)


def flag_seed_ring() -> int:
    """Create the seed graph and set ``fraudRingId`` on the ring accounts (idempotent)."""
    from app.core.config import get_settings
    from app.graph.client import GraphClient, GraphError
    from app.graph.seed import apply_seed

    settings = get_settings()
    client = GraphClient(settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password)
    try:
        client.verify()
        return apply_seed(client)
    except GraphError as exc:
        raise DemoError(f"Neo4j unavailable: {exc}", EXIT_DEPENDENCY) from exc
    finally:
        client.close()


def stored_graph_hops(event_id: str) -> int | None:
    """``graph_hops`` is not in the HTTP response; read what the service persisted."""
    import psycopg

    with psycopg.connect(plain_dsn(admin_database_url()), connect_timeout=5) as conn:
        row = conn.execute(
            "SELECT graph_hops FROM fraud_events WHERE id = %s", (UUID(event_id),)
        ).fetchone()
    return None if row is None else row[0]


def run(url: str) -> None:
    scenario = build_scenario()
    require_service(url)
    ensure_tenant(DEMO_TENANT_ID)
    events = flag_seed_ring()
    print(
        f"tenant {DEMO_TENANT_ID} ready; seed graph applied ({events} events), "
        f"ring {SEED_RING_ID} accounts flagged: {', '.join(RING_ACCOUNTS)}"
    )
    for event in scenario.history:
        post_or_fail(f"{url}/v1/transactions/score", wire(event))
    print(
        f"replayed {len(scenario.history)} synthetic history transactions for "
        f"{len(VICTIMS)} victims"
    )
    print()
    for step in scenario.probes:
        body = post_or_fail(f"{url}/v1/transactions/score", wire(step.event))
        score = body["score"]
        hops = body.get("graph_hops", stored_graph_hops(body["fraud_event_id"]))
        print(step.label)
        print(f"  amount={step.event.amount:.2f} at {step.event.timestamp.isoformat()}")
        print(
            f"  status={score['status']} fraud_probability={score['fraud_probability']} "
            f"graph_status={score['graph_status']} graph_hops={hops}"
        )
        print(
            f"  fraud_ring_ids={body['fraud_ring_ids']} "
            f"suspicious_accounts={body['suspicious_accounts']} graph_synced={body['graph_synced']}"
        )
        drivers = body["top_drivers"]
        if drivers:
            for d in drivers:
                print(f"  driver {d['feature']}={d['value']} shap={d['shap_contribution']}")
        else:
            print("  top_drivers=[] (SHAP is only computed for FLAGGED/BLOCKED)")
        print(f"  model={score['model_version']} service_latency_ms={body['total_latency_ms']}")
    print("\nSynthetic data only: these numbers do not describe real-bank performance.")


def main(argv: list[str]) -> int:
    load_root_env()
    try:
        run(base_url(argv[1] if len(argv) > 1 else None))
    except DemoError as exc:
        fail(exc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
