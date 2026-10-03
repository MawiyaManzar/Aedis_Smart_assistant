"""Fraud scoring service boundary."""

from __future__ import annotations

from app.core.errors import ModelNotLoadedError
from app.models.loaders import OnnxFraudModelLoader
from app.schemas.fraud import FraudScoreRequest, FraudScoreResponse


class FraudInferenceService:
    def __init__(self, loader: OnnxFraudModelLoader) -> None:
        self._loader = loader

    def score(self, request: FraudScoreRequest) -> FraudScoreResponse:
        if not self._loader.is_loaded:
            raise ModelNotLoadedError(
                f"fraud model {self._loader.version} is not loaded: "
                f"{self._loader.status().error or 'startup has not loaded it'}"
            )
        raise NotImplementedError("ONNX fraud scoring is implemented in the ONNX milestone")
