"""Feature contracts for the next implementation phase."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import Channel


class FraudFeatures(BaseModel):
    """Model inputs named by the fraud architecture. Values are supplied by the caller."""

    amount_zscore: float
    velocity_1h: float
    velocity_24h: float
    graph_hops: int = Field(ge=0)
    is_new_beneficiary: bool
    device_age_days: float = Field(ge=0)
    ip_country_risk: float
    hour_of_day: int = Field(ge=0, le=23)
    day_of_week: int = Field(ge=0, le=6)
    channel_risk_score: float


class FraudFeatureSource(BaseModel):
    """Raw transaction fields already defined by the API gateway contract."""

    tenant_id: UUID
    transaction_id: UUID
    amount: float = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    channel: Channel
    occurred_at: datetime
    from_account_id: str = Field(min_length=1)
    to_account_id: str = Field(min_length=1)
    device_id: str | None = None
    ip_address: str | None = None


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
