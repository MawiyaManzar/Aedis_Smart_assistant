"""Loan-distress scoring service boundary."""

from __future__ import annotations

from app.core.errors import ModelNotLoadedError
from app.models.loaders import LightGbmDistressModelLoader
from app.schemas.distress import DistressBatchRequest, DistressBatchResponse


class DistressInferenceService:
    def __init__(self, loader: LightGbmDistressModelLoader) -> None:
        self._loader = loader

    def score_batch(self, request: DistressBatchRequest) -> DistressBatchResponse:
        if not self._loader.is_loaded:
            raise ModelNotLoadedError(
                f"distress model {self._loader.version} is not loaded: "
                f"{self._loader.status().error or 'startup has not loaded it'}"
            )
        raise NotImplementedError("LightGBM scoring is implemented in the distress milestone")
