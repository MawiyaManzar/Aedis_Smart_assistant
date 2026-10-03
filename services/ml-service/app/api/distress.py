"""Loan-distress scoring route."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.container import ServiceContainer, get_container
from app.schemas.distress import DistressBatchRequest, DistressBatchResponse

router = APIRouter(prefix="/models/distress", tags=["distress"])


@router.post("/score-batch", response_model=DistressBatchResponse)
def score_distress_batch(
    body: DistressBatchRequest,
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> DistressBatchResponse:
    return container.distress.score_batch(body)
