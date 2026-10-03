"""Documented constants for fraud features. No magic numbers in the feature functions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

# Graph hop encoding (see FraudFeatures docstring).
GRAPH_HOPS_UNKNOWN = -1
GRAPH_MAX_HOPS = 3
GRAPH_NO_CONNECTION = GRAPH_MAX_HOPS + 1

# Quality flags attached to a computed feature vector.
FLAG_BASELINE_INSUFFICIENT = "baseline_insufficient"
FLAG_DEVICE_MISSING = "device_missing"
FLAG_IP_MISSING = "ip_missing"
FLAG_CHANNEL_UNKNOWN = "channel_unknown"
FLAG_GRAPH_UNAVAILABLE = "graph_unavailable"

# Demo priors, NOT calibrated on real data. Documented in docs/dev1/fraud-features.md.
DEFAULT_CHANNEL_RISK: dict[str, float] = {
    "branch": 0.1,
    "mobile": 0.3,
    "web": 0.4,
    "atm": 0.6,
}
UNKNOWN_CHANNEL_RISK = 0.5

# CIDR -> risk. Documentation/private ranges only, so the demo needs no geo-IP database.
DEFAULT_IP_RISK_TABLE: dict[str, float] = {
    "203.0.113.0/24": 0.9,  # demo "high-risk region"
    "198.51.100.0/24": 0.5,  # demo "medium-risk region"
    "192.0.2.0/24": 0.1,  # demo "low-risk region"
    "10.0.0.0/8": 0.1,  # internal
    "172.16.0.0/12": 0.1,
    "192.168.0.0/16": 0.1,
}
UNLISTED_IP_RISK = 0.3
MISSING_IP_RISK = 0.5


@dataclass(frozen=True)
class FraudFeatureConfig:
    """Tunable parameters. Defaults are used by training and serving alike."""

    history_lookback: timedelta = timedelta(days=90)
    baseline_window: timedelta = timedelta(days=30)
    baseline_min_history: int = 5
    std_floor_fraction: float = 0.05  # of |mean|
    std_floor_absolute: float = 1.0  # currency units
    zscore_clip: float = 10.0
    channel_risk: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_CHANNEL_RISK))
    ip_risk_table: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_IP_RISK_TABLE))
