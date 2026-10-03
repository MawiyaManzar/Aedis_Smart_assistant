import json
import logging
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import AppError
from app.core.logging import JsonFormatter, request_id_var
from app.main import create_app
from app.models.loaders import ModelArtifactError, ModelArtifactNotFound, OnnxFraudModelLoader

FRAUD_BODY = {
    "transaction_id": "8b0b0d0e-6c1a-4f0a-9c2d-1a2b3c4d5e6f",
    "tenant_id": "11111111-1111-1111-1111-111111111111",
    "features": {
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
    },
}


def test_validation_error_uses_stable_error_body(client: TestClient) -> None:
    response = client.post("/v1/models/fraud/score", json={"transaction_id": "nope"})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["request_id"] == response.headers["x-request-id"]
    assert error["details"]


def test_scoring_without_model_returns_503_not_a_fake_score(client: TestClient) -> None:
    response = client.post("/v1/models/fraud/score", json=FRAUD_BODY)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MODEL_NOT_LOADED"


def test_unknown_route_uses_error_body(client: TestClient) -> None:
    response = client.get("/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "HTTP_ERROR"


def test_unhandled_exception_is_sanitized() -> None:
    app = create_app(Settings(artifacts_dir=Path("/nonexistent")))

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/boom")
    assert response.status_code == 500
    assert "secret" not in response.text
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"


def test_app_error_maps_status_and_code() -> None:
    app = create_app(Settings(artifacts_dir=Path("/nonexistent")))

    class Teapot(AppError):
        status_code = 418
        code = "TEAPOT"

    @app.get("/teapot")
    def teapot() -> None:
        raise Teapot("short and stout")

    with TestClient(app) as client:
        response = client.get("/teapot")
    assert response.status_code == 418
    assert response.json()["error"] == {
        "code": "TEAPOT",
        "message": "short and stout",
        "request_id": response.headers["x-request-id"],
    }


def test_json_log_includes_request_id_and_extras() -> None:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "hello", None, None)
    record.custom_field = 7
    token = request_id_var.set("req-1")
    try:
        parsed = json.loads(JsonFormatter().format(record))
    finally:
        request_id_var.reset(token)
    assert parsed["message"] == "hello"
    assert parsed["request_id"] == "req-1"
    assert parsed["custom_field"] == 7


@pytest.fixture
def artifact_dir(tmp_path: Path) -> Iterator[Path]:
    yield tmp_path


def test_loader_missing_artifact_raises(artifact_dir: Path) -> None:
    loader = OnnxFraudModelLoader(artifact_dir, "fraud-v1")
    with pytest.raises(ModelArtifactNotFound):
        loader.load()
    assert loader.is_loaded is False
    assert "not found" in (loader.status().error or "")


def test_loader_reads_metadata_and_checks_version(artifact_dir: Path) -> None:
    model_dir = artifact_dir / "fraud" / "fraud-v1"
    model_dir.mkdir(parents=True)
    (model_dir / "metadata.json").write_text(json.dumps({"model_version": "fraud-v9"}))
    loader = OnnxFraudModelLoader(artifact_dir, "fraud-v1")
    with pytest.raises(ModelArtifactError, match="does not match"):
        loader.load()
    # Right version but no usable weights/feature list: must fail, never "load" silently.
    (model_dir / "metadata.json").write_text(json.dumps({"model_version": "fraud-v1"}))
    with pytest.raises(ModelArtifactError, match="feature_list"):
        loader.load()
    assert not loader.is_loaded


def test_require_models_aborts_startup_when_artifact_missing(tmp_path: Path) -> None:
    app: FastAPI = create_app(Settings(artifacts_dir=tmp_path, require_models=True))
    with pytest.raises(ModelArtifactNotFound), TestClient(app):
        pass


def test_models_are_loaded_once_not_per_request(tmp_path: Path) -> None:
    model_dir = tmp_path / "fraud" / "fraud-v1"
    model_dir.mkdir(parents=True)
    (model_dir / "metadata.json").write_text(json.dumps({"model_version": "fraud-v1"}))
    calls = {"n": 0}
    original = OnnxFraudModelLoader._load_weights

    def counting(self: OnnxFraudModelLoader) -> None:
        calls["n"] += 1
        original(self)

    OnnxFraudModelLoader._load_weights = counting  # type: ignore[method-assign]
    try:
        app = create_app(Settings(artifacts_dir=tmp_path))
        with TestClient(app) as client:
            for _ in range(3):
                client.get("/version")
    finally:
        OnnxFraudModelLoader._load_weights = original  # type: ignore[method-assign]
    assert calls["n"] == 1
