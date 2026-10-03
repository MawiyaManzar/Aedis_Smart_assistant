from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.features.distress import build_distress_features
from app.main import create_app
from app.schemas.features import DistressFeatureSource


def test_feature_builder_definitions() -> None:
    f = build_distress_features(
        DistressFeatureSource(
            borrower_id=uuid4(),
            avg_balance_30d=500,
            avg_balance_60d=1000,
            atm_14d=300,
            atm_28d=400,
            new_high_interest_count=2,
        )  # fmt: skip
    )
    assert f.balance_drop_pct == 50.0
    assert f.atm_spike_ratio == 1.5
    assert f.new_credit_count == 2


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(require_models=False))) as c:
        yield c


def _item(f: dict[str, float]) -> dict[str, object]:
    return {"borrower_id": str(uuid4()), "features": f}


def test_score_batch_orders_and_bands(client: TestClient) -> None:
    healthy = {"avg_balance_30d": 3000, "avg_balance_60d": 2900, "balance_drop_pct": -3,
               "atm_spike_ratio": 1.0, "new_credit_count": 0}  # fmt: skip
    stressed = {"avg_balance_30d": 800, "avg_balance_60d": 3000, "balance_drop_pct": 73,
                "atm_spike_ratio": 3.0, "new_credit_count": 3}  # fmt: skip
    r = client.post(
        "/v1/models/distress/score-batch",
        json={"evaluation_date": "2026-10-01", "borrowers": [_item(healthy), _item(stressed)]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    low, high = body["scores"]
    assert low["distress_score"] < high["distress_score"]
    assert low["risk_band"] == "LOW" and high["risk_band"] != "LOW"
    assert body["model_version"] == "distress-v1" and body["inference_latency_ms"] >= 0
