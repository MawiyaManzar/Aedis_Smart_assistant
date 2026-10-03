from datetime import datetime
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.db.sql_script import split_sql
from app.features.distress import DistressFeatureBuilder
from app.features.fraud import FraudFeatureBuilder
from app.schemas.features import (
    DistressFeatures,
    DistressFeatureSource,
    FraudFeatures,
    FraudFeatureSource,
)

TRANSACTION_ID = "8b0b0d0e-6c1a-4f0a-9c2d-1a2b3c4d5e6f"
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
        tenant_id=UUID("11111111-1111-1111-1111-111111111111"),
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


def test_distress_without_model_is_503(client: TestClient) -> None:
    response = client.post(
        "/v1/models/distress/score-batch",
        json={
            "evaluation_date": "2026-10-03",
            "borrowers": [{"borrower_id": BORROWER_ID, "features": DISTRESS_FEATURES}],
        },
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MODEL_NOT_LOADED"


def test_distress_batch_rejects_empty_list(client: TestClient) -> None:
    response = client.post(
        "/v1/models/distress/score-batch",
        json={"evaluation_date": "2026-10-03", "borrowers": []},
    )
    assert response.status_code == 422


def test_shap_without_model_is_503(client: TestClient) -> None:
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
    assert response.status_code == 503


def test_schema_sql_splits_and_names_required_tables() -> None:
    sql_path = Path(__file__).resolve().parents[3] / "infra" / "postgres" / "init.sql"
    statements = split_sql(sql_path.read_text(encoding="utf-8"))
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
