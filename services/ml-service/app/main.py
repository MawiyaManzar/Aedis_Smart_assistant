"""FastAPI application entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings
from app.core.container import get_container
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    get_container().load_models()
    yield


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    application = FastAPI(
        title="Aedis ML Service",
        version=settings.service_version,
        summary="Developer 1 model contracts. Scoring responses are stubs until the next phase.",
        lifespan=lifespan,
    )
    application.include_router(api_router)
    return application


app = create_app()
