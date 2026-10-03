from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.metrics import (
    DashboardMetrics,
    FraudStatusCounts,
    ResolutionCounts,
    RiskBandCounts,
)


def _metrics(**over: object) -> DashboardMetrics:
    base: dict[str, object] = {
        "tenant_id": uuid4(),
        "since": datetime(2026, 1, 1, tzinfo=UTC),
        "until": datetime(2026, 1, 2, tzinfo=UTC),
        "fraud_events_total": 0,
        "fraud_events_by_status": FraudStatusCounts(approved=0, flagged=0, blocked=0),
        "flagged_blocked_rate": None,
        "resolutions": ResolutionCounts(pending=0, resolved=0),
        "distress_by_risk_band": RiskBandCounts(low=0, medium=0, high=0, critical=0),
        "graph_degraded_count": 0,
        "transactions_count": 0,
    }
    base.update(over)
    return DashboardMetrics.model_validate(base)


def test_empty_metrics_have_null_latency_and_rate() -> None:
    m = _metrics()
    assert m.flagged_blocked_rate is None
    assert m.inference_latency_avg_ms is None
    assert m.inference_latency_p95_ms is None


def test_rate_must_be_within_unit_interval() -> None:
    with pytest.raises(ValidationError):
        _metrics(flagged_blocked_rate=1.5)


def test_counts_cannot_be_negative() -> None:
    with pytest.raises(ValidationError):
        _metrics(transactions_count=-1)


def test_metrics_endpoint_validation_error_body(client) -> None:  # type: ignore[no-untyped-def]
    r = client.get("/v1/dashboard/metrics")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    r = client.get(
        "/v1/dashboard/metrics", params={"tenant_id": str(uuid4()), "since": "2999-01-01T00:00:00Z"}
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
