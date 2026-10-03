"""Internal service-to-service routes (not part of the public dashboard API)."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.container import ServiceContainer, get_container
from app.graph.models import SyncResult
from app.schemas.transaction import TransactionEvent

router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/graph/sync", response_model=SyncResult)
def sync_graph(
    event: TransactionEvent,
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> SyncResult:
    """Idempotently write one transaction into the fraud graph."""
    return container.graph_sync.sync(event)
