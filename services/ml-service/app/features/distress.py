"""Loan-distress feature-builder boundary."""

from app.schemas.features import DistressFeatures, DistressFeatureSource


class DistressFeatureBuilder:
    """Accepts architecture SQL aggregates and will later emit DistressFeatures."""

    feature_names: tuple[str, ...] = tuple(DistressFeatures.model_fields)

    def build(self, source: DistressFeatureSource) -> DistressFeatures:
        raise NotImplementedError(
            f"Distress feature computation is not implemented for {source.borrower_id}."
        )
