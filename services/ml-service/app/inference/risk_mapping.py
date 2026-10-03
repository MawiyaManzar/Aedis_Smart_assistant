"""Probability / score -> categorical status mappings (single source of truth)."""

from __future__ import annotations

from app.schemas.common import FraudStatus, RiskBand

FRAUD_FLAG_THRESHOLD = 0.3
FRAUD_BLOCK_THRESHOLD = 0.7


def fraud_status(probability: float) -> FraudStatus:
    """``< 0.3`` APPROVED, ``0.3 <= p <= 0.7`` FLAGGED, ``> 0.7`` BLOCKED."""
    if probability > FRAUD_BLOCK_THRESHOLD:
        return "BLOCKED"
    if probability >= FRAUD_FLAG_THRESHOLD:
        return "FLAGGED"
    return "APPROVED"


def distress_band(score: float) -> RiskBand:
    """0-39 LOW, 40-59 MEDIUM, 60-74 HIGH, 75-100 CRITICAL (score is 0-100)."""
    if score >= 75:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"
