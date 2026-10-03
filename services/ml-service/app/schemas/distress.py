"""Loan-distress batch HTTP contract."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import RiskBand
from app.schemas.features import DistressFeatures


class DistressScoreItem(BaseModel):
    borrower_id: UUID
    features: DistressFeatures


class DistressBatchRequest(BaseModel):
    evaluation_date: date
    borrowers: list[DistressScoreItem] = Field(min_length=1, max_length=500)


class DistressScoreResult(BaseModel):
    borrower_id: UUID
    distress_score: int = Field(ge=0, le=100)
    risk_band: RiskBand


class DistressBatchResponse(BaseModel):
    model_version: str
    feature_version: str
    evaluation_date: date
    scores: list[DistressScoreResult]
    inference_latency_ms: float = Field(description="Measured LightGBM predict time, ms")
