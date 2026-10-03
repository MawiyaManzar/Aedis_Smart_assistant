"""Loan-distress scoring service (LightGBM)."""

from __future__ import annotations

import time

import numpy as np

from app.core.errors import ModelNotLoadedError
from app.features.distress import DISTRESS_FEATURE_ORDER
from app.inference.risk_mapping import distress_band
from app.models.loaders import LightGbmDistressModelLoader
from app.schemas.distress import (
    DistressBatchRequest,
    DistressBatchResponse,
    DistressScoreResult,
)


class DistressInferenceService:
    def __init__(self, loader: LightGbmDistressModelLoader) -> None:
        self._loader = loader

    def score_batch(self, request: DistressBatchRequest) -> DistressBatchResponse:
        if not self._loader.is_loaded:
            raise ModelNotLoadedError(
                f"distress model {self._loader.version} is not loaded: "
                f"{self._loader.status().error or 'startup has not loaded it'}"
            )
        x = np.asarray(
            [
                [float(getattr(b.features, n)) for n in DISTRESS_FEATURE_ORDER]
                for b in request.borrowers
            ],
            dtype=np.float64,
        )
        started = time.perf_counter()
        probabilities = self._loader.predict_proba(x)
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        scores = [int(round(float(p) * 100)) for p in probabilities]
        return DistressBatchResponse(
            model_version=self._loader.version,
            feature_version=str(self._loader.metadata.get("feature_version", "unknown")),
            evaluation_date=request.evaluation_date,
            scores=[
                DistressScoreResult(
                    borrower_id=b.borrower_id, distress_score=s, risk_band=distress_band(s)
                )
                for b, s in zip(request.borrowers, scores, strict=True)
            ],
            inference_latency_ms=round(elapsed_ms, 4),
        )
