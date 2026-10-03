"""Loan-distress scoring service boundary."""

import time

from app.core.constants import DISTRESS_STUB_DETAIL, UNSET_MODEL_VERSION
from app.models.loaders import LightGbmDistressModelLoader
from app.schemas.distress import DistressBatchRequest, DistressBatchResponse, DistressScoreResult


class DistressInferenceService:
    """Returns a marked stub until LightGBM inference is implemented."""

    def __init__(self, loader: LightGbmDistressModelLoader) -> None:
        self._loader = loader

    def score_batch(self, request: DistressBatchRequest) -> DistressBatchResponse:
        started = time.perf_counter()
        if self._loader.is_loaded:
            raise RuntimeError("LightGBM distress scoring is not implemented.")
        scores = [
            DistressScoreResult(
                borrower_id=item.borrower_id,
                distress_score=None,
                risk_band=None,
            )
            for item in request.borrowers
        ]
        elapsed_ms = (time.perf_counter() - started) * 1000
        return DistressBatchResponse(
            model_version=UNSET_MODEL_VERSION,
            inference_mode="stub",
            evaluation_date=request.evaluation_date,
            scores=scores,
            latency_ms=round(elapsed_ms, 3),
            detail=DISTRESS_STUB_DETAIL,
        )
