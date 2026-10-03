"""SHAP explainer service boundary."""

from __future__ import annotations

from app.core.errors import ModelNotLoadedError
from app.models.loaders import ModelLoader
from app.schemas.explain import DistressExplainRequest, FraudExplainRequest, ShapExplainResponse


class ShapExplainService:
    def __init__(self, fraud_loader: ModelLoader, distress_loader: ModelLoader) -> None:
        self._loaders = {"fraud": fraud_loader, "distress": distress_loader}

    def explain(self, request: FraudExplainRequest | DistressExplainRequest) -> ShapExplainResponse:
        loader = self._loaders[request.model_name]
        if not loader.is_loaded:
            raise ModelNotLoadedError(f"{request.model_name} model is not loaded")
        raise NotImplementedError("SHAP is implemented in the explainability milestone")
