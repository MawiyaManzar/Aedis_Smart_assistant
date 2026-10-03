from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import numpy as np
import pytest
from fastapi.testclient import TestClient
from tests.test_fraud_inference import SUSPICIOUS

from app.core.config import Settings
from app.main import create_app


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app(Settings(require_models=False))) as c:
        yield c


def test_fraud_shap_is_numeric_sorted_and_additive(client: TestClient) -> None:
    r = client.post(
        "/v1/models/explain/shap",
        json={
            "model_name": "fraud", "entity_type": "FRAUD_EVENT", "entity_id": str(uuid4()),
            "features": SUSPICIOUS, "top_n": 10,
        },
    )  # fmt: skip
    assert r.status_code == 200, r.text
    body = r.json()
    drivers = body["top_drivers"]
    mags = [abs(d["shap_contribution"]) for d in drivers]
    assert mags == sorted(mags, reverse=True)
    assert all(set(d) == {"feature", "value", "shap_contribution"} for d in drivers)
    # base + sum(contributions) is the model's raw margin -> sigmoid == fraud probability.
    margin = body["base_value"] + sum(d["shap_contribution"] for d in drivers)
    prob = 1 / (1 + np.exp(-margin))
    score = client.post(
        "/v1/models/fraud/score",
        json={"transaction_id": str(uuid4()), "tenant_id": str(uuid4()), "features": SUSPICIOUS},
    ).json()["fraud_probability"]
    assert prob == pytest.approx(score, abs=1e-4)


def test_distress_shap_top_n(client: TestClient) -> None:
    feats = {"avg_balance_30d": 800, "avg_balance_60d": 3000, "balance_drop_pct": 73,
             "atm_spike_ratio": 3.0, "new_credit_count": 3}  # fmt: skip
    r = client.post(
        "/v1/models/explain/shap",
        json={
            "model_name": "distress", "entity_type": "DISTRESS_SCORE",
            "entity_id": str(uuid4()), "features": feats, "top_n": 2,
        },
    )  # fmt: skip
    assert r.status_code == 200, r.text
    assert len(r.json()["top_drivers"]) == 2
