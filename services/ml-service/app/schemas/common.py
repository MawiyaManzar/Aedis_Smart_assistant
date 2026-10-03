"""Shared API literals."""

from typing import Literal

InferenceMode = Literal["stub"]
FraudStatus = Literal["APPROVED", "FLAGGED", "BLOCKED"]
RiskBand = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
EntityType = Literal["FRAUD_EVENT", "DISTRESS_SCORE"]
ModelName = Literal["fraud", "distress"]
Channel = Literal["mobile", "web", "atm", "branch"]
