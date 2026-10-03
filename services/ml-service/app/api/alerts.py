"""Analyst alert resolution route."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.core.container import ServiceContainer, get_container
from app.services.alert_resolution import AlertResolutionService, Resolution

router = APIRouter(prefix="/alerts", tags=["alerts"])


class ResolveAlertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: UUID
    resolution: Resolution
    resolved_by: str = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)


class ResolveAlertResponse(BaseModel):
    alert_id: UUID
    tenant_id: UUID
    previous_resolution: Resolution
    resolution: Resolution
    resolved_by: str | None
    resolved_at: datetime | None
    changed: bool


@router.post("/{alert_id}/resolve", response_model=ResolveAlertResponse)
def resolve_alert(
    alert_id: UUID,
    body: ResolveAlertRequest,
    container: Annotated[ServiceContainer, Depends(get_container)],
) -> ResolveAlertResponse:
    result = AlertResolutionService(container.engine).resolve(
        alert_id=alert_id,
        tenant_id=body.tenant_id,
        resolution=body.resolution,
        resolved_by=body.resolved_by,
        note=body.note,
    )
    return ResolveAlertResponse(
        alert_id=result.alert_id,
        tenant_id=result.tenant_id,
        previous_resolution=result.previous_resolution,
        resolution=result.resolution,
        resolved_by=result.resolved_by,
        resolved_at=result.resolved_at,
        changed=result.changed,
    )
