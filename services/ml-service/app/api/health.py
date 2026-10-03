"""Liveness, readiness, and version endpoints."""

import platform
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.readiness import neo4j_ready, postgres_ready, redis_ready

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


class ReadyResponse(BaseModel):
    status: Literal["ok", "degraded"]
    postgres: bool
    redis: bool
    neo4j: bool


class VersionResponse(BaseModel):
    service: str
    version: str
    python: str
    inference_mode: Literal["stub"]


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", service=settings.service_name)


@router.get("/health/ready", response_model=ReadyResponse)
def ready(response: Response) -> ReadyResponse:
    settings = get_settings()
    postgres = postgres_ready(settings)
    redis = redis_ready(settings)
    neo4j = neo4j_ready(settings)
    if not (postgres and redis and neo4j):
        response.status_code = 503
    return ReadyResponse(
        status="ok" if postgres and redis and neo4j else "degraded",
        postgres=postgres,
        redis=redis,
        neo4j=neo4j,
    )


@router.get("/version", response_model=VersionResponse)
def version() -> VersionResponse:
    settings = get_settings()
    return VersionResponse(
        service=settings.service_name,
        version=settings.service_version,
        python=platform.python_version(),
        inference_mode="stub",
    )
