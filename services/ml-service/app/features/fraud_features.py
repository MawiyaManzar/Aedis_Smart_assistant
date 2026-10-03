"""Pure, deterministic fraud feature functions.

Every function takes explicit inputs (no I/O, no clock) so training and serving share the
exact same logic. Time filters are applied here, strictly before the event time, so a history
provider cannot introduce look-ahead leakage.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Iterable, Sequence
from datetime import datetime, timedelta
from ipaddress import ip_address, ip_network

from app.features.config import (
    MISSING_IP_RISK,
    UNKNOWN_CHANNEL_RISK,
    UNLISTED_IP_RISK,
    FraudFeatureConfig,
)
from app.features.history import HistoricalTransaction


def prior(
    history: Iterable[HistoricalTransaction], at: datetime, exclude: object | None = None
) -> list[HistoricalTransaction]:
    """History strictly before ``at`` (and not the event itself)."""
    return [h for h in history if h.occurred_at < at and h.transaction_id != exclude]


def amount_zscore(
    amount: float,
    prior_history: Sequence[HistoricalTransaction],
    at: datetime,
    config: FraudFeatureConfig,
) -> tuple[float, bool]:
    """How unusual ``amount`` is for this sender. Returns ``(value, baseline_ok)``.

    Baseline: finite amounts of the sender's outgoing transactions in
    ``[at - baseline_window, at)``. With at least ``baseline_min_history`` of them:
    ``z = (amount - mean) / max(sample_std, std_floor_fraction*|mean|, std_floor_absolute)``,
    clipped to ``+-zscore_clip``. With fewer, returns ``(0.0, False)``: no evidence of
    abnormality, flagged so callers can see the baseline was too thin.
    """
    window_start = at - config.baseline_window
    amounts = [
        h.amount
        for h in prior_history
        if window_start <= h.occurred_at < at and math.isfinite(h.amount)
    ]
    if len(amounts) < config.baseline_min_history or not math.isfinite(amount):
        return 0.0, False
    mean = statistics.fmean(amounts)
    std = statistics.stdev(amounts)
    scale = max(std, config.std_floor_fraction * abs(mean), config.std_floor_absolute)
    z = (amount - mean) / scale
    return max(-config.zscore_clip, min(config.zscore_clip, z)), True


def velocity(
    prior_history: Sequence[HistoricalTransaction], at: datetime, window: timedelta
) -> int:
    """Count of the sender's outgoing transactions in ``[at - window, at)``, excluding this one."""
    start = at - window
    return sum(1 for h in prior_history if start <= h.occurred_at < at)


def is_new_beneficiary(prior_history: Sequence[HistoricalTransaction], to_account_id: str) -> bool:
    """True if the sender has not paid ``to_account_id`` within the history lookback."""
    return all(h.to_account_id != to_account_id for h in prior_history)


def device_age_days(first_seen: datetime | None, at: datetime) -> float:
    """Days between the device's first use and ``at``. First-ever use (or unknown) -> 0.0."""
    if first_seen is None or first_seen >= at:
        return 0.0
    return (at - first_seen) / timedelta(days=1)


def ip_country_risk(ip: str | None, table: dict[str, float]) -> tuple[float, bool]:
    """Risk in [0, 1] for the IP's network from ``table``. Returns ``(value, ip_present)``."""
    if not ip:
        return MISSING_IP_RISK, False
    try:
        address = ip_address(ip)
    except ValueError:
        return MISSING_IP_RISK, False
    for cidr, risk in table.items():
        network = ip_network(cidr)
        if address.version == network.version and address in network:
            return risk, True
    return UNLISTED_IP_RISK, True


def hour_of_day(at: datetime) -> int:
    """Hour 0-23 in UTC (event timestamps are normalised to UTC on input)."""
    return at.hour


def day_of_week(at: datetime) -> int:
    """Monday = 0 ... Sunday = 6, in UTC."""
    return at.weekday()


def channel_risk_score(channel: str, table: dict[str, float]) -> tuple[float, bool]:
    """Static prior per channel. Returns ``(value, channel_known)``."""
    risk = table.get(channel.lower())
    if risk is None:
        return UNKNOWN_CHANNEL_RISK, False
    return risk, True
