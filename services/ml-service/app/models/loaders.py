"""Model artifact loaders. Each model is loaded once at service startup.

Artifact layout (created by the training scripts)::

    artifacts/<name>/<version>/metadata.json    # version, feature list, metrics, timestamps
    artifacts/<name>/<version>/<weights files>  # format depends on the model
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class ModelArtifactError(Exception):
    """Artifact exists but cannot be used."""


class ModelArtifactNotFound(ModelArtifactError):
    """No artifact for the requested model version."""


@dataclass(frozen=True)
class ModelStatus:
    name: str
    version: str
    loaded: bool
    error: str | None = None


class ModelLoader:
    """Base loader: resolves the artifact directory and reads ``metadata.json``."""

    name: str = "model"

    def __init__(self, artifacts_dir: Path, version: str) -> None:
        self.version = version
        self.artifact_dir = artifacts_dir / self.name / version
        self.metadata: dict[str, Any] = {}
        self._loaded = False
        self._error: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """Load weights into memory. Raises if the artifact is missing or invalid."""
        metadata_path = self.artifact_dir / "metadata.json"
        try:
            if not metadata_path.is_file():
                raise ModelArtifactNotFound(f"{self.name} artifact not found at {metadata_path}")
            self.metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if self.metadata.get("model_version") != self.version:
                raise ModelArtifactError(
                    f"{self.name} metadata version {self.metadata.get('model_version')!r} "
                    f"does not match requested {self.version!r}"
                )
            self._load_weights()
        except ModelArtifactError as exc:
            self._loaded = False
            self._error = str(exc)
            raise
        except (OSError, ValueError) as exc:
            self._loaded = False
            self._error = f"{type(exc).__name__}: {exc}"
            raise ModelArtifactError(self._error) from exc
        self._loaded = True
        self._error = None
        logger.info("model_loaded", extra={"model": self.name, "model_version": self.version})

    def _load_weights(self) -> None:
        """Subclasses load their weights here."""

    def status(self) -> ModelStatus:
        return ModelStatus(self.name, self.version, self._loaded, self._error)


class OnnxFraudModelLoader(ModelLoader):
    """Fraud model. ONNX session creation is added with the inference milestone."""

    name = "fraud"


class LightGbmDistressModelLoader(ModelLoader):
    """Distress model. Booster loading is added with the distress milestone."""

    name = "distress"
