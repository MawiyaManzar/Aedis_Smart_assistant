from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def empty_artifacts(tmp_path: Path) -> Path:
    """An artifacts directory with no models, to test the degraded (no-model) path."""
    return tmp_path / "artifacts"


@pytest.fixture
def client(empty_artifacts: Path) -> Iterator[TestClient]:
    """App with no model artifacts. Models are therefore unavailable (503 on scoring)."""
    app = create_app(Settings(artifacts_dir=empty_artifacts, require_models=False))
    with TestClient(app) as test_client:
        yield test_client
