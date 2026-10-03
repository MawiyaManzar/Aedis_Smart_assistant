"""SHAP explanation route."""

from typing import Annotated

from fastapi import APIRouter
from pydantic import Field

from app.core.container import get_container
from app.schemas.explain import DistressExplainRequest, FraudExplainRequest, ShapExplainResponse

router = APIRouter(prefix="/models/explain", tags=["explain"])


@router.post("/shap", response_model=ShapExplainResponse)
def explain_shap(
    body: Annotated[
        FraudExplainRequest | DistressExplainRequest,
        Field(discriminator="model_name"),
    ],
) -> ShapExplainResponse:
    return get_container().explainer.explain(body)
