import sys

from fastapi.testclient import TestClient


def test_python_is_311() -> None:
    assert sys.version_info[:2] == (3, 11)


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "aedis-ml-service"}


def test_version_reports_python_and_model_status(client: TestClient) -> None:
    body = client.get("/version").json()
    assert body["service"] == "aedis-ml-service"
    assert body["version"] == "0.1.0"
    assert body["python"].startswith("3.11.")
    models = {m["name"]: m for m in body["models"]}
    assert set(models) == {"fraud", "distress"}
    assert models["fraud"]["loaded"] is False
    assert models["fraud"]["version"] == "fraud-v1"


def test_responses_carry_request_id_and_timing(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert response.headers["x-request-id"] == "abc-123"
    assert float(response.headers["x-process-time-ms"]) >= 0
    generated = client.get("/health").headers["x-request-id"]
    assert len(generated) == 32
