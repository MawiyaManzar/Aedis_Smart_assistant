"""Loan-distress scoring route."""

from fastapi import APIRouter

from app.core.container import get_container
from app.schemas.distress import DistressBatchRequest, DistressBatchResponse

router = APIRouter(prefix="/models/distress", tags=["distress"])


@router.post("/score-batch", response_model=DistressBatchResponse)
def score_distress_batch(body: DistressBatchRequest) -> DistressBatchResponse:
    return get_container().distress.score_batch(body)
