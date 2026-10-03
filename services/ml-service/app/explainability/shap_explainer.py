"""SHAP explainer boundary."""

import time

from app.core.constants import SHAP_STUB_DETAIL, UNSET_MODEL_VERSION
from app.schemas.explain import DistressExplainRequest, FraudExplainRequest, ShapExplainResponse


class ShapExplainService:
    """Returns a marked stub until TreeExplainer is implemented."""

    def explain(self, request: FraudExplainRequest | DistressExplainRequest) -> ShapExplainResponse:
        started = time.perf_counter()
        elapsed_ms = (time.perf_counter() - started) * 1000
        return ShapExplainResponse(
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            model_name=request.model_name,
            model_version=UNSET_MODEL_VERSION,
            inference_mode="stub",
            top_drivers=[],
            latency_ms=round(elapsed_ms, 3),
            detail=SHAP_STUB_DETAIL,
        )
