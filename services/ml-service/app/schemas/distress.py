"""Loan-distress batch HTTP contract."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import InferenceMode, RiskBand
from app.schemas.features import DistressFeatures


class DistressScoreItem(BaseModel):
    borrower_id: UUID
    features: DistressFeatures


class DistressBatchRequest(BaseModel):
    evaluation_date: date
    borrowers: list[DistressScoreItem] = Field(min_length=1, max_length=500)


class DistressScoreResult(BaseModel):
    borrower_id: UUID
    distress_score: int | None = Field(description="Null while inference is a contract stub")
    risk_band: RiskBand | None


class DistressBatchResponse(BaseModel):
    model_version: str = Field(description="unset until a real LightGBM artifact is loaded")
    inference_mode: InferenceMode
    evaluation_date: date
    scores: list[DistressScoreResult]
    latency_ms: float = Field(description="Handler elapsed time, not a model benchmark")
    detail: str
