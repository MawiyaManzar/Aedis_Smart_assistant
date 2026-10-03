"""Dashboard graph view route (Cytoscape-ready JSON)."""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query

from app.core.container import ServiceContainer, get_container
from app.core.errors import DependencyUnavailableError, NotFoundError
from app.graph.client import GraphError
from app.graph.view import DEFAULT_DEPTH, MAX_DEPTH, GraphView

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/graph/{account_id}", response_model=GraphView)
def account_graph(
    account_id: Annotated[str, Path(min_length=1, max_length=200)],
    tenant_id: Annotated[UUID, Query()],
    container: Annotated[ServiceContainer, Depends(get_container)],
    depth: Annotated[int, Query(ge=1, le=MAX_DEPTH)] = DEFAULT_DEPTH,
) -> GraphView:
    try:
        view = container.graph_view.neighbourhood(str(tenant_id), account_id, depth)
    except GraphError as exc:
        logger.warning("graph_view_failed", extra={"reason": str(exc)})
        raise DependencyUnavailableError("Graph database unavailable") from exc
    if view is None:
        raise NotFoundError(f"Account '{account_id}' not found for tenant")
    return view
