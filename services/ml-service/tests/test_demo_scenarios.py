"""Pure scenario-building logic of the demo scripts: deterministic, no stack required."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import demo_loan_distress as loan  # noqa: E402
import demo_scam_ring as ring  # noqa: E402

from app.graph.seed import RING_ACCOUNTS  # noqa: E402


def test_scam_scenario_is_deterministic() -> None:
    first, second = ring.build_scenario(), ring.build_scenario()
    assert [e.model_dump() for e in first.history] == [e.model_dump() for e in second.history]
    assert [(p.label, p.event.model_dump()) for p in first.probes] == [
        (p.label, p.event.model_dump()) for p in second.probes
    ]


def test_scam_scenario_shape_and_time_ordering() -> None:
    scenario = ring.build_scenario()
    ids = [e.transaction_id for e in scenario.history] + [
        p.event.transaction_id for p in scenario.probes
    ]
    assert len(ids) == len(set(ids))
    assert len(scenario.history) == len(ring.VICTIMS) * ring.HISTORY_PER_VICTIM
    assert all(e.timestamp < ring.BASE_TIME for e in scenario.history)
    assert all(e.timestamp >= ring.BASE_TIME for e in (p.event for p in scenario.probes))
    ring_probes = [p.event for p in scenario.probes if p.event.to_account_id in RING_ACCOUNTS]
    assert len(ring_probes) == len(ring.VICTIMS) * 2
    assert all(e.timestamp.hour == 3 and e.device_id == ring.RING_DEVICE for e in ring_probes)
    assert all(e.tenant_id == ring.DEMO_TENANT_ID for e in scenario.history)


def test_wire_body_is_camel_case_and_json_safe() -> None:
    body = ring.wire(ring.build_scenario().probes[0].event)
    assert {"tenantId", "transactionId", "fromAccountId", "toAccountId", "timestamp"} <= set(body)
    assert isinstance(body["transactionId"], str)


def test_distress_borrowers_deterministic_and_separated() -> None:
    a, b = loan.build_borrowers(), loan.build_borrowers()
    assert [x.source for x in a] == [x.source for x in b]
    features = loan.build_features(a)
    assert features == loan.build_features(b)
    healthy = [features[x.borrower_id] for x in a if x.profile == "healthy"]
    sick = [features[x.borrower_id] for x in a if x.profile == "deteriorating"]
    assert len(healthy) == loan.HEALTHY and len(sick) == loan.DETERIORATING
    assert max(f.balance_drop_pct for f in healthy) < min(f.balance_drop_pct for f in sick)
    assert max(f.new_credit_count for f in healthy) < min(f.new_credit_count for f in sick)


def test_distress_batch_body_matches_contract() -> None:
    from app.schemas.distress import DistressBatchRequest

    body = loan.batch_body(loan.build_features(loan.build_borrowers()))
    request = DistressBatchRequest.model_validate(body)
    assert len(request.borrowers) == loan.HEALTHY + loan.DETERIORATING
