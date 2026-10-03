"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.container import ServiceContainer
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        container = ServiceContainer(settings)
        container.load_models()  # once per process, never per request
        container.register_models()
        application.state.container = container
        logger.info("service_started", extra={"version": settings.service_version})
        try:
            yield
        finally:
            container.close()
            logger.info("service_stopped")

    application = FastAPI(
        title="Aedis ML Service",
        version=settings.service_version,
        summary="Fraud and loan-distress scoring plus numeric SHAP explanations.",
        lifespan=lifespan,
    )
    application.add_middleware(RequestContextMiddleware)
    install_error_handlers(application)
    application.include_router(api_router)
    return application


app = create_app()
