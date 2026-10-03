"""Placeholder model loaders. They do not read or invent weights."""

import logging

logger = logging.getLogger(__name__)


class OnnxFraudModelLoader:
    """Boundary for the future ONNX Runtime fraud session."""

    def __init__(self, model_path: str | None) -> None:
        self.model_path = model_path
        self._session: object | None = None

    def load(self) -> None:
        """Keep the session unloaded during the setup phase."""
        self._session = None
        if self.model_path:
            logger.info("fraud model path is set, but weights are not loaded")

    @property
    def is_loaded(self) -> bool:
        return self._session is not None


class LightGbmDistressModelLoader:
    """Boundary for the future LightGBM booster."""

    def __init__(self, model_path: str | None) -> None:
        self.model_path = model_path
        self._booster: object | None = None

    def load(self) -> None:
        """Keep the booster unloaded during the setup phase."""
        self._booster = None
        if self.model_path:
            logger.info("distress model path is set, but weights are not loaded")

    @property
    def is_loaded(self) -> bool:
        return self._booster is not None
