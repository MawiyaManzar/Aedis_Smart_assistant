"""SHAP explanation route."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import Field

from app.core.container import ServiceContainer, get_container
from app.schemas.explain import DistressExplainRequest, FraudExplainRequest, ShapExplainResponse

router = APIRouter(prefix="/models/explain", tags=["explain"])


@router.post("/shap", response_model=ShapExplainResponse)
def explain_shap(
    body: Annotated[
        FraudExplainRequest | DistressExplainRequest,
        Field(discriminator="model_name"),
    ],
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> ShapExplainResponse:
    return container.explainer.explain(body)
