"""Process-wide service objects."""

from functools import lru_cache

from app.core.config import Settings, get_settings
from app.explainability.shap_explainer import ShapExplainService
from app.inference.distress import DistressInferenceService
from app.inference.fraud import FraudInferenceService
from app.models.loaders import LightGbmDistressModelLoader, OnnxFraudModelLoader


class ServiceContainer:
    """Holds loader and service boundaries created at startup."""

    def __init__(self, settings: Settings) -> None:
        self.fraud_loader = OnnxFraudModelLoader(settings.fraud_model_path)
        self.distress_loader = LightGbmDistressModelLoader(settings.distress_model_path)
        self.fraud = FraudInferenceService(self.fraud_loader)
        self.distress = DistressInferenceService(self.distress_loader)
        self.explainer = ShapExplainService()

    def load_models(self) -> None:
        self.fraud_loader.load()
        self.distress_loader.load()


@lru_cache
def get_container() -> ServiceContainer:
    return ServiceContainer(get_settings())
