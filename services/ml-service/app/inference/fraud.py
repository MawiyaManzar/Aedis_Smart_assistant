"""Fraud scoring service: ONNX Runtime inference over the ordered feature vector."""

from __future__ import annotations

import time

import numpy as np

from app.core.errors import ModelNotLoadedError
from app.features.config import GRAPH_HOPS_UNKNOWN
from app.features.fraud import FRAUD_FEATURE_ORDER
from app.inference.risk_mapping import fraud_status
from app.models.loaders import OnnxFraudModelLoader
from app.schemas.features import FraudFeatures
from app.schemas.fraud import FraudScoreRequest, FraudScoreResponse


class FraudInferenceService:
    def __init__(self, loader: OnnxFraudModelLoader) -> None:
        self._loader = loader

    def _require_loaded(self) -> None:
        if not self._loader.is_loaded:
            raise ModelNotLoadedError(
                f"fraud model {self._loader.version} is not loaded: "
                f"{self._loader.status().error or 'startup has not loaded it'}"
            )

    def predict(self, features: FraudFeatures) -> tuple[float, float]:
        """Return ``(probability, session_run_ms)``."""
        self._require_loaded()
        row = np.asarray(
            [[getattr(features, name) for name in FRAUD_FEATURE_ORDER]], dtype=np.float32
        )
        started = time.perf_counter()
        probability = self._loader.predict_proba(row)
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        return float(probability[0]), elapsed_ms

    def score(self, request: FraudScoreRequest) -> FraudScoreResponse:
        probability, elapsed_ms = self.predict(request.features)
        return FraudScoreResponse(
            transaction_id=request.transaction_id,
            model_version=self._loader.version,
            feature_version=str(self._loader.metadata.get("feature_version", "unknown")),
            fraud_probability=min(max(probability, 0.0), 1.0),
            status=fraud_status(probability),
            graph_status="DEGRADED" if request.features.graph_hops == GRAPH_HOPS_UNKNOWN else "OK",
            inference_latency_ms=round(elapsed_ms, 4),
        )
