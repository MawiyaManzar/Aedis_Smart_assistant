"""End-to-end transaction scoring route."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.container import ServiceContainer, get_container
from app.inference.pipeline import TransactionScoreResponse
from app.schemas.transaction import TransactionEvent

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("/score", response_model=TransactionScoreResponse)
def score_transaction(
    event: TransactionEvent,
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> TransactionScoreResponse:
    """Compute features from history + graph, score, persist, audit, then sync the graph."""
    return container.scoring.score(event)
