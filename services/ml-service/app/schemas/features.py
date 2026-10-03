"""Feature contracts. Field order here is the model input order (see ``app.features``)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class FraudFeatures(BaseModel):
    """Fraud model inputs. The meaning of each field is documented in docs/dev1/fraud-features.md.

    ``graph_hops``: 0 = the sender account itself is flagged in a fraud ring, 1..3 = shortest
    relationship path to a flagged account, 4 = no flagged account within 3 hops, -1 = graph
    lookup unavailable (degraded).
    """

    amount_zscore: float
    velocity_1h: float = Field(ge=0)
    velocity_24h: float = Field(ge=0)
    graph_hops: int = Field(ge=-1, le=4)
    is_new_beneficiary: bool
    device_age_days: float = Field(ge=0)
    ip_country_risk: float = Field(ge=0, le=1)
    hour_of_day: int = Field(ge=0, le=23)
    day_of_week: int = Field(ge=0, le=6)
    channel_risk_score: float = Field(ge=0, le=1)


class DistressFeatures(BaseModel):
    """Feature-store fields named by the loan-distress architecture."""

    avg_balance_30d: float
    avg_balance_60d: float
    balance_drop_pct: float
    atm_spike_ratio: float
    new_credit_count: int = Field(ge=0)


class DistressFeatureSource(BaseModel):
    """Aggregate inputs named by the architecture's per-borrower SQL."""

    borrower_id: UUID
    avg_balance_30d: float
    avg_balance_60d: float
    atm_14d: float
    atm_28d: float
    new_high_interest_count: int = Field(ge=0)
