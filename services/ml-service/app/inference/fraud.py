"""Fraud scoring service boundary."""

import time

from app.core.constants import FRAUD_STUB_DETAIL, UNSET_MODEL_VERSION
from app.models.loaders import OnnxFraudModelLoader
from app.schemas.fraud import FraudScoreRequest, FraudScoreResponse


class FraudInferenceService:
    """Returns a marked stub until ONNX inference is implemented."""

    def __init__(self, loader: OnnxFraudModelLoader) -> None:
        self._loader = loader

    def score(self, request: FraudScoreRequest) -> FraudScoreResponse:
        started = time.perf_counter()
        if self._loader.is_loaded:
            raise RuntimeError("ONNX fraud scoring is not implemented.")
        elapsed_ms = (time.perf_counter() - started) * 1000
        return FraudScoreResponse(
            transaction_id=request.transaction_id,
            model_version=UNSET_MODEL_VERSION,
            inference_mode="stub",
            fraud_probability=None,
            status=None,
            latency_ms=round(elapsed_ms, 3),
            detail=FRAUD_STUB_DETAIL,
        )
