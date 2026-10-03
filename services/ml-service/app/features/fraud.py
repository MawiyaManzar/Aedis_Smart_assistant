"""Fraud feature-builder boundary."""

from app.schemas.features import FraudFeatures, FraudFeatureSource


class FraudFeatureBuilder:
    """Accepts gateway transaction fields and will later emit FraudFeatures."""

    feature_names: tuple[str, ...] = tuple(FraudFeatures.model_fields)

    def build(self, source: FraudFeatureSource) -> FraudFeatures:
        raise NotImplementedError(
            f"Fraud feature computation is not implemented for {source.transaction_id}."
        )
