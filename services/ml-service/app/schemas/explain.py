"""SHAP explanation HTTP contract."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import EntityType, InferenceMode, ModelName
from app.schemas.features import DistressFeatures, FraudFeatures


class ShapDriver(BaseModel):
    feature: str
    value: float | int | bool | None = None
    shap_contribution: float | None = None


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
    model_version: str = Field(description="unset until a real explainer is loaded")
    inference_mode: InferenceMode
    top_drivers: list[ShapDriver]
    latency_ms: float = Field(description="Handler elapsed time, not a model benchmark")
    detail: str
