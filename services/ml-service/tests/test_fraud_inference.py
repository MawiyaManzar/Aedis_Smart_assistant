"""ONNX fraud inference, parity with XGBoost, and the score endpoint (real committed artifact)."""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import numpy as np
import pytest
import xgboost as xgb
from fastapi.testclient import TestClient

from app.core.config import SERVICE_ROOT, Settings
from app.inference.risk_mapping import distress_band, fraud_status
from app.main import create_app

ARTIFACT = SERVICE_ROOT / "artifacts" / "fraud" / "fraud-v1" / "model.json"
TENANT = "00000000-0000-4000-8000-0000000000d1"

NORMAL = {
    "amount_zscore": 0.1, "velocity_1h": 1, "velocity_24h": 3, "graph_hops": 4,
    "is_new_beneficiary": 0, "device_age_days": 200, "ip_country_risk": 0.1,
    "hour_of_day": 14, "day_of_week": 2, "channel_risk_score": 0.2,
}  # fmt: skip
SUSPICIOUS = {
    "amount_zscore": 9.0, "velocity_1h": 7, "velocity_24h": 10, "graph_hops": 1,
    "is_new_beneficiary": 1, "device_age_days": 0, "ip_country_risk": 0.9,
    "hour_of_day": 3, "day_of_week": 6, "channel_risk_score": 0.6,
}  # fmt: skip


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(require_models=False))) as c:
        yield c


def _body(features: dict[str, float]) -> dict[str, object]:
    return {"transaction_id": str(uuid4()), "tenant_id": TENANT, "features": features}


def test_status_boundaries() -> None:
    assert fraud_status(0.2999) == "APPROVED"
    assert fraud_status(0.3) == "FLAGGED"
    assert fraud_status(0.7) == "FLAGGED"
    assert fraud_status(0.7001) == "BLOCKED"
    assert [distress_band(s) for s in (0, 39, 40, 59, 60, 74, 75, 100)] == [
        "LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "CRITICAL", "CRITICAL",
    ]  # fmt: skip


def test_model_loaded_at_startup(client: TestClient) -> None:
    assert client.app.state.container.fraud_loader.is_loaded  # type: ignore[attr-defined]


def test_onnx_matches_xgboost_native(client: TestClient) -> None:
    loader = client.app.state.container.fraud_loader  # type: ignore[attr-defined]
    booster = xgb.Booster()
    booster.load_model(ARTIFACT)
    rng = np.random.default_rng(0)
    x = np.column_stack(
        [
            rng.normal(0, 3, 500), rng.integers(0, 10, 500), rng.integers(0, 20, 500),
            rng.integers(-1, 5, 500), rng.integers(0, 2, 500), rng.integers(0, 400, 500),
            rng.uniform(0, 1, 500), rng.integers(0, 24, 500), rng.integers(0, 7, 500),
            rng.uniform(0, 1, 500),
        ]
    ).astype(np.float32)  # fmt: skip
    native = booster.predict(xgb.DMatrix(x))
    assert np.max(np.abs(native - loader.predict_proba(x))) < 1e-5


def test_score_endpoint_orders_normal_below_suspicious(client: TestClient) -> None:
    normal = client.post("/v1/models/fraud/score", json=_body(NORMAL))
    risky = client.post("/v1/models/fraud/score", json=_body(SUSPICIOUS))
    assert normal.status_code == risky.status_code == 200
    n, r = normal.json(), risky.json()
    assert n["status"] == "APPROVED" and r["status"] in {"FLAGGED", "BLOCKED"}
    assert n["fraud_probability"] < r["fraud_probability"]
    assert n["model_version"] == "fraud-v1" and n["feature_version"] == "fraud-features-v1"
    assert n["graph_status"] == "OK"
    assert 0 < n["inference_latency_ms"] < 1000


def test_graph_unavailable_is_reported_as_degraded(client: TestClient) -> None:
    response = client.post("/v1/models/fraud/score", json=_body({**NORMAL, "graph_hops": -1}))
    assert response.status_code == 200
    assert response.json()["graph_status"] == "DEGRADED"


def test_rejects_unknown_feature_values(client: TestClient) -> None:
    response = client.post("/v1/models/fraud/score", json=_body({**NORMAL, "graph_hops": 9}))
    assert response.status_code == 422
