"""Fraud scoring route."""

from fastapi import APIRouter

from app.core.container import get_container
from app.schemas.fraud import FraudScoreRequest, FraudScoreResponse

router = APIRouter(prefix="/models/fraud", tags=["fraud"])


@router.post("/score", response_model=FraudScoreResponse)
def score_fraud(body: FraudScoreRequest) -> FraudScoreResponse:
    return get_container().fraud.score(body)
