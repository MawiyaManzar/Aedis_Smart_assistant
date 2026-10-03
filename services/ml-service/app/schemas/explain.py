"""SHAP explanation HTTP contract."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import EntityType, ModelName
from app.schemas.features import DistressFeatures, FraudFeatures


class ShapDriver(BaseModel):
    feature: str
    value: float
    shap_contribution: float = Field(description="Log-odds contribution; positive raises risk")


class FraudExplainRequest(BaseModel):
    model_name: Literal["fraud"]
    entity_type: Literal["FRAUD_EVENT"]
    entity_id: UUID
    features: FraudFeatures
    top_n: int = Field(default=3, ge=1, le=10)


class DistressExplainRequest(BaseModel):
    model_name: Literal["distress"]
    entity_type: Literal["DISTRESS_SCORE"]
    entity_id: UUID
    features: DistressFeatures
    top_n: int = Field(default=3, ge=1, le=10)


ShapExplainRequest = Annotated[
    FraudExplainRequest | DistressExplainRequest,
    Field(discriminator="model_name"),
]


class ShapExplainResponse(BaseModel):
    entity_type: EntityType
    entity_id: UUID
    model_name: ModelName
    model_version: str
    base_value: float = Field(description="Expected model output (log-odds) over background")
    top_drivers: list[ShapDriver]
    inference_latency_ms: float = Field(description="Measured SHAP computation time, ms")
