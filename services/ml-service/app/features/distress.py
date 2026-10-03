"""Loan-distress feature builder (pure functions over SQL-style aggregates).

Definitions (documented in docs/dev1/distress-features.md):
  balance_drop_pct = 100 * (avg_balance_60d - avg_balance_30d) / max(avg_balance_60d, 1)
                     positive = balances falling; clipped to [-100, 100].
  atm_spike_ratio  = atm_14d / max(atm_28d / 2, 1)  (recent 14d ATM withdrawals vs the average
                     14d rate over 28d; 1.0 = steady); clipped to [0, 20].
  new_credit_count = new high-interest credit accounts opened recently.
"""

from __future__ import annotations

from app.schemas.features import DistressFeatures, DistressFeatureSource

DISTRESS_FEATURE_ORDER: tuple[str, ...] = tuple(DistressFeatures.model_fields)
DISTRESS_FEATURE_VERSION = "distress-features-v1"


def build_distress_features(source: DistressFeatureSource) -> DistressFeatures:
    drop = (
        100.0 * (source.avg_balance_60d - source.avg_balance_30d) / max(source.avg_balance_60d, 1.0)
    )
    spike = source.atm_14d / max(source.atm_28d / 2.0, 1.0)
    return DistressFeatures(
        avg_balance_30d=source.avg_balance_30d,
        avg_balance_60d=source.avg_balance_60d,
        balance_drop_pct=min(max(drop, -100.0), 100.0),
        atm_spike_ratio=min(max(spike, 0.0), 20.0),
        new_credit_count=source.new_high_interest_count,
    )


def to_vector(features: DistressFeatures) -> list[float]:
    return [float(getattr(features, name)) for name in DISTRESS_FEATURE_ORDER]


class DistressFeatureBuilder:
    feature_names = DISTRESS_FEATURE_ORDER

    def build(self, source: DistressFeatureSource) -> DistressFeatures:
        return build_distress_features(source)
