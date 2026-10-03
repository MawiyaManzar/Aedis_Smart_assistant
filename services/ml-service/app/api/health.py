"""Liveness, readiness, and version endpoints."""

import platform
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from app.core.container import ServiceContainer, get_container
from app.core.readiness import neo4j_ready, postgres_ready, redis_ready

router = APIRouter(tags=["health"])

Container = Annotated[ServiceContainer, Depends(get_container)]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


class ModelStatusResponse(BaseModel):
    name: str
    version: str
    loaded: bool
    error: str | None = None


class ReadyResponse(BaseModel):
    status: Literal["ok", "degraded"]
    postgres: bool
    redis: bool
    neo4j: bool
    models: list[ModelStatusResponse]


class VersionResponse(BaseModel):
    service: str
    version: str
    python: str
    models: list[ModelStatusResponse]


@router.get("/health", response_model=HealthResponse)
def health(container: Container) -> HealthResponse:
    return HealthResponse(status="ok", service=container.settings.service_name)


@router.get("/health/ready", response_model=ReadyResponse)
def ready(response: Response, container: Container) -> ReadyResponse:
    postgres = postgres_ready(container)
    redis = redis_ready(container)
    neo4j = neo4j_ready(container)
    models = [ModelStatusResponse(**vars(s)) for s in container.model_statuses()]
    healthy = postgres and redis and neo4j and all(m.loaded for m in models)
    if not healthy:
        response.status_code = 503
    return ReadyResponse(
        status="ok" if healthy else "degraded",
        postgres=postgres,
        redis=redis,
        neo4j=neo4j,
        models=models,
    )


@router.get("/version", response_model=VersionResponse)
def version(container: Container) -> VersionResponse:
    return VersionResponse(
        service=container.settings.service_name,
        version=container.settings.service_version,
        python=platform.python_version(),
        models=[ModelStatusResponse(**vars(s)) for s in container.model_statuses()],
    )
