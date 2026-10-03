"""Fraud scoring HTTP contract."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import FraudStatus
from app.schemas.features import FraudFeatures

GraphStatus = Literal["OK", "DEGRADED"]


class FraudScoreRequest(BaseModel):
    transaction_id: UUID
    tenant_id: UUID
    features: FraudFeatures


class FraudScoreResponse(BaseModel):
    transaction_id: UUID
    model_version: str
    feature_version: str
    fraud_probability: float = Field(ge=0.0, le=1.0)
    status: FraudStatus
    graph_status: GraphStatus = Field(
        description="DEGRADED when graph_hops was unavailable (-1); score is then less reliable"
    )
    inference_latency_ms: float = Field(
        description="Measured ONNX Runtime session.run time for this request, in milliseconds"
    )
