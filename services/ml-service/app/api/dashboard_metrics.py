"""GET /v1/dashboard/metrics — aggregates computed from persisted Postgres rows."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import SQLAlchemyError

from app.core.container import ServiceContainer, get_container
from app.core.errors import AppError, DependencyUnavailableError
from app.db.metrics import compute_dashboard_metrics
from app.schemas.metrics import DashboardMetrics

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

DEFAULT_WINDOW = timedelta(hours=24)


class InvalidWindowError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"


@router.get("/metrics", response_model=DashboardMetrics)
def dashboard_metrics(
    container: Annotated[ServiceContainer, Depends(get_container)],
    tenant_id: Annotated[UUID, Query()],
    since: Annotated[datetime | None, Query()] = None,
) -> DashboardMetrics:
    until = datetime.now(UTC)
    if since is None:
        since = until - DEFAULT_WINDOW
    elif since.tzinfo is None:
        since = since.replace(tzinfo=UTC)
    if since > until:
        raise InvalidWindowError("`since` must not be in the future")
    try:
        with container.engine.connect() as conn:
            return compute_dashboard_metrics(conn, tenant_id, since, until)
    except SQLAlchemyError as exc:
        raise DependencyUnavailableError("Metrics database unavailable") from exc
