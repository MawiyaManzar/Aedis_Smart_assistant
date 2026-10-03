"""Fraud scoring route."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.container import ServiceContainer, get_container
from app.schemas.fraud import FraudScoreRequest, FraudScoreResponse

router = APIRouter(prefix="/models/fraud", tags=["fraud"])


@router.post("/score", response_model=FraudScoreResponse)
def score_fraud(
    body: FraudScoreRequest,
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> FraudScoreResponse:
    return container.fraud.score(body)
