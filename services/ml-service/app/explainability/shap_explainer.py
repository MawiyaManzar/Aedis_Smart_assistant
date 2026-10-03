"""SHAP TreeExplainer service. Returns numeric drivers only (no natural language)."""

from __future__ import annotations

import threading
import time
from typing import Any

import numpy as np
import shap

from app.core.errors import ModelNotLoadedError
from app.features.distress import DISTRESS_FEATURE_ORDER
from app.features.fraud import FRAUD_FEATURE_ORDER
from app.models.loaders import LightGbmDistressModelLoader, OnnxFraudModelLoader
from app.schemas.explain import (
    DistressExplainRequest,
    FraudExplainRequest,
    ShapDriver,
    ShapExplainResponse,
)


def _positive_class(values: Any) -> np.ndarray:
    """Normalise SHAP output across versions: list per class, or [N, F] / [N, F, C]."""
    if isinstance(values, list):
        values = values[-1]
    arr = np.asarray(values)
    if arr.ndim == 3:
        arr = arr[:, :, -1]
    return arr


def _base_value(explainer: shap.TreeExplainer) -> float:
    return float(np.ravel(np.asarray(explainer.expected_value))[-1])


class ShapExplainService:
    def __init__(
        self, fraud_loader: OnnxFraudModelLoader, distress_loader: LightGbmDistressModelLoader
    ) -> None:
        self._fraud = fraud_loader
        self._distress = distress_loader
        self._explainers: dict[str, shap.TreeExplainer] = {}
        self._lock = threading.Lock()

    def _explainer(self, name: str) -> shap.TreeExplainer:
        """Built once per process on first use (the model is immutable after load)."""
        with self._lock:
            if name in self._explainers:
                return self._explainers[name]
            if name == "fraud":
                if not self._fraud.is_loaded or self._fraud.native_booster is None:
                    raise ModelNotLoadedError("fraud model is not loaded")
                model: Any = self._fraud.native_booster
            else:
                if not self._distress.is_loaded or self._distress.booster is None:
                    raise ModelNotLoadedError("distress model is not loaded")
                model = self._distress.booster
            self._explainers[name] = shap.TreeExplainer(model)
            return self._explainers[name]

    def explain(self, request: FraudExplainRequest | DistressExplainRequest) -> ShapExplainResponse:
        if isinstance(request, FraudExplainRequest):
            names, loader_version = FRAUD_FEATURE_ORDER, self._fraud.version
            raw = [float(getattr(request.features, n)) for n in names]
            dtype: Any = np.float32
        else:
            names, loader_version = DISTRESS_FEATURE_ORDER, self._distress.version
            raw = [float(getattr(request.features, n)) for n in names]
            dtype = np.float64
        explainer = self._explainer(request.model_name)
        x = np.asarray([raw], dtype=dtype)
        started = time.perf_counter()
        contributions = _positive_class(explainer.shap_values(x))[0]
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        order = np.argsort(-np.abs(contributions))[: request.top_n]
        return ShapExplainResponse(
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            model_name=request.model_name,
            model_version=loader_version,
            base_value=_base_value(explainer),
            top_drivers=[
                ShapDriver(
                    feature=names[i],
                    value=raw[i],
                    shap_contribution=float(contributions[i]),
                )
                for i in order
            ],
            inference_latency_ms=round(elapsed_ms, 4),
        )
