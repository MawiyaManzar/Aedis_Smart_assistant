from datetime import datetime
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.core.constants import DISTRESS_STUB_DETAIL, FRAUD_STUB_DETAIL, SHAP_STUB_DETAIL
from app.db.sql_script import split_sql
from app.features.distress import DistressFeatureBuilder
from app.features.fraud import FraudFeatureBuilder
from app.models.loaders import OnnxFraudModelLoader
from app.schemas.features import (
    DistressFeatures,
    DistressFeatureSource,
    FraudFeatures,
    FraudFeatureSource,
)

TRANSACTION_ID = "8b0b0d0e-6c1a-4f0a-9c2d-1a2b3c4d5e6f"
TENANT_ID = "11111111-1111-1111-1111-111111111111"
BORROWER_ID = "22222222-2222-2222-2222-222222222222"

FRAUD_FEATURES = {
    "amount_zscore": 1.5,
    "velocity_1h": 2.0,
    "velocity_24h": 4.0,
    "graph_hops": 1,
    "is_new_beneficiary": True,
    "device_age_days": 3.0,
    "ip_country_risk": 0.2,
    "hour_of_day": 3,
    "day_of_week": 1,
    "channel_risk_score": 0.4,
}

DISTRESS_FEATURES = {
    "avg_balance_30d": 1000.0,
    "avg_balance_60d": 1400.0,
    "balance_drop_pct": 0.28,
    "atm_spike_ratio": 1.2,
    "new_credit_count": 1,
}


def test_fraud_feature_names() -> None:
    assert list(FraudFeatures.model_fields) == [
        "amount_zscore",
        "velocity_1h",
        "velocity_24h",
        "graph_hops",
        "is_new_beneficiary",
        "device_age_days",
        "ip_country_risk",
        "hour_of_day",
        "day_of_week",
        "channel_risk_score",
    ]


def test_distress_feature_names() -> None:
    assert list(DistressFeatures.model_fields) == [
        "avg_balance_30d",
        "avg_balance_60d",
        "balance_drop_pct",
        "atm_spike_ratio",
        "new_credit_count",
    ]


def test_feature_builders_are_not_implemented() -> None:
    fraud_source = FraudFeatureSource(
        tenant_id=UUID(TENANT_ID),
        transaction_id=UUID(TRANSACTION_ID),
        amount=10,
        currency="USD",
        channel="mobile",
        occurred_at=datetime.fromisoformat("2026-10-03T12:00:00+00:00"),
        from_account_id="acct-1",
        to_account_id="acct-2",
    )
    distress_source = DistressFeatureSource(
        borrower_id=UUID(BORROWER_ID),
        avg_balance_30d=1,
        avg_balance_60d=2,
        atm_14d=3,
        atm_28d=4,
        new_high_interest_count=0,
    )
    with pytest.raises(NotImplementedError):
        FraudFeatureBuilder().build(fraud_source)
    with pytest.raises(NotImplementedError):
        DistressFeatureBuilder().build(distress_source)


def test_loader_does_not_mark_weights_loaded() -> None:
    loader = OnnxFraudModelLoader("models/fraud.onnx")
    loader.load()
    assert loader.is_loaded is False


def test_fraud_score_stub(client: TestClient) -> None:
    response = client.post(
        "/v1/models/fraud/score",
        json={
            "transaction_id": TRANSACTION_ID,
            "tenant_id": TENANT_ID,
            "features": FRAUD_FEATURES,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["inference_mode"] == "stub"
    assert body["model_version"] == "unset"
    assert body["fraud_probability"] is None
    assert body["status"] is None
    assert body["detail"] == FRAUD_STUB_DETAIL


def test_fraud_score_rejects_invalid_payload(client: TestClient) -> None:
    response = client.post("/v1/models/fraud/score", json={"transaction_id": "not-a-uuid"})
    assert response.status_code == 422


def test_distress_batch_stub(client: TestClient) -> None:
    response = client.post(
        "/v1/models/distress/score-batch",
        json={
            "evaluation_date": "2026-10-03",
            "borrowers": [{"borrower_id": BORROWER_ID, "features": DISTRESS_FEATURES}],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["inference_mode"] == "stub"
    assert body["model_version"] == "unset"
    assert body["scores"] == [
        {"borrower_id": BORROWER_ID, "distress_score": None, "risk_band": None}
    ]
    assert body["detail"] == DISTRESS_STUB_DETAIL


def test_distress_batch_rejects_empty_list(client: TestClient) -> None:
    response = client.post(
        "/v1/models/distress/score-batch",
        json={"evaluation_date": "2026-10-03", "borrowers": []},
    )
    assert response.status_code == 422


def test_shap_stub(client: TestClient) -> None:
    response = client.post(
        "/v1/models/explain/shap",
        json={
            "model_name": "fraud",
            "entity_type": "FRAUD_EVENT",
            "entity_id": TRANSACTION_ID,
            "features": FRAUD_FEATURES,
            "top_n": 3,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["inference_mode"] == "stub"
    assert body["model_version"] == "unset"
    assert body["top_drivers"] == []
    assert body["detail"] == SHAP_STUB_DETAIL


def test_schema_sql_splits_and_names_required_tables() -> None:
    sql_path = Path(__file__).resolve().parents[3] / "infra" / "postgres" / "init.sql"
    script = sql_path.read_text(encoding="utf-8")
    statements = split_sql(script)
    joined = "\n".join(statements)
    for table in (
        "tenants",
        "users",
        "borrowers",
        "transactions",
        "fraud_events",
        "loan_distress_scores",
        "audit_log",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table}" in joined
    function_statements = [item for item in statements if "prevent_audit_log_mutation" in item]
    assert function_statements
    assert function_statements[0].count("$$") == 2
