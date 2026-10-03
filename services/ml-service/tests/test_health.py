import sys

from fastapi.testclient import TestClient


def test_python_is_311() -> None:
    assert sys.version_info[:2] == (3, 11)


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "aedis-ml-service"}


def test_version_reports_311_and_stub_mode(client: TestClient) -> None:
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "aedis-ml-service"
    assert body["version"] == "0.1.0"
    assert body["python"].startswith("3.11.")
    assert body["inference_mode"] == "stub"
