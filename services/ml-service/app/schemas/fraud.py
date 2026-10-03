"""Fraud scoring HTTP contract."""

from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import FraudStatus, InferenceMode
from app.schemas.features import FraudFeatures


class FraudScoreRequest(BaseModel):
    transaction_id: UUID
    tenant_id: UUID
    features: FraudFeatures


class FraudScoreResponse(BaseModel):
    transaction_id: UUID
    model_version: str = Field(description="unset until a real ONNX artifact is loaded")
    inference_mode: InferenceMode
    fraud_probability: float | None = Field(description="Null while inference is a contract stub")
    status: FraudStatus | None
    latency_ms: float = Field(description="Handler elapsed time, not a model benchmark")
    detail: str
