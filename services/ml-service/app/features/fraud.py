"""Fraud feature builder: the single place a transaction becomes a model input."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from app.features import fraud_features as ff
from app.features.config import (
    FLAG_BASELINE_INSUFFICIENT,
    FLAG_CHANNEL_UNKNOWN,
    FLAG_DEVICE_MISSING,
    FLAG_GRAPH_UNAVAILABLE,
    FLAG_IP_MISSING,
    GRAPH_HOPS_UNKNOWN,
    FraudFeatureConfig,
)
from app.features.history import HistoryProvider
from app.schemas.features import FraudFeatures
from app.schemas.transaction import TransactionEvent

# Stable model input order. Training metadata records it; inference checks it.
FRAUD_FEATURE_ORDER: tuple[str, ...] = tuple(FraudFeatures.model_fields)


@dataclass(frozen=True)
class FraudFeatureResult:
    features: FraudFeatures
    flags: list[str] = field(default_factory=list)


def to_vector(features: FraudFeatures) -> list[float]:
    """Features as floats in ``FRAUD_FEATURE_ORDER`` (booleans become 0.0 / 1.0)."""
    values = features.model_dump()
    return [float(values[name]) for name in FRAUD_FEATURE_ORDER]


class FraudFeatureBuilder:
    feature_names: tuple[str, ...] = FRAUD_FEATURE_ORDER

    def __init__(self, config: FraudFeatureConfig | None = None) -> None:
        self.config = config or FraudFeatureConfig()

    def build(
        self,
        event: TransactionEvent,
        history: HistoryProvider,
        graph_hops: int | None = None,
    ) -> FraudFeatureResult:
        """Compute features for ``event``.

        ``graph_hops`` comes from graph enrichment; ``None`` means the lookup was unavailable
        and is encoded as ``GRAPH_HOPS_UNKNOWN`` with a ``graph_unavailable`` flag.
        """
        cfg = self.config
        at = event.timestamp
        rows = history.outgoing_history(
            event.tenant_id, event.from_account_id, at, cfg.history_lookback
        )
        prior_rows = ff.prior(rows, at, exclude=event.transaction_id)
        flags: list[str] = []

        zscore, baseline_ok = ff.amount_zscore(event.amount, prior_rows, at, cfg)
        if not baseline_ok:
            flags.append(FLAG_BASELINE_INSUFFICIENT)

        first_seen = (
            history.device_first_seen(event.tenant_id, event.device_id) if event.device_id else None
        )
        if not event.device_id:
            flags.append(FLAG_DEVICE_MISSING)

        ip_risk, ip_present = ff.ip_country_risk(event.ip_address, cfg.ip_risk_table)
        if not ip_present:
            flags.append(FLAG_IP_MISSING)

        channel_risk, channel_known = ff.channel_risk_score(event.channel, cfg.channel_risk)
        if not channel_known:
            flags.append(FLAG_CHANNEL_UNKNOWN)

        if graph_hops is None:
            flags.append(FLAG_GRAPH_UNAVAILABLE)
            hops = GRAPH_HOPS_UNKNOWN
        else:
            hops = graph_hops

        features = FraudFeatures(
            amount_zscore=zscore,
            velocity_1h=ff.velocity(prior_rows, at, timedelta(hours=1)),
            velocity_24h=ff.velocity(prior_rows, at, timedelta(hours=24)),
            graph_hops=hops,
            is_new_beneficiary=ff.is_new_beneficiary(prior_rows, event.to_account_id),
            device_age_days=ff.device_age_days(first_seen, at),
            ip_country_risk=ip_risk,
            hour_of_day=ff.hour_of_day(at),
            day_of_week=ff.day_of_week(at),
            channel_risk_score=channel_risk,
        )
        return FraudFeatureResult(features=features, flags=flags)
