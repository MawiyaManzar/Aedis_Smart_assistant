"""Dependency checks for the readiness endpoint, using the shared clients."""

from __future__ import annotations

import logging

from sqlalchemy import text

from app.core.container import ServiceContainer

logger = logging.getLogger(__name__)


def postgres_ready(container: ServiceContainer) -> bool:
    try:
        with container.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("postgres_not_ready", extra={"error_type": type(exc).__name__})
        return False


def redis_ready(container: ServiceContainer) -> bool:
    try:
        return bool(container.redis.ping())
    except Exception as exc:
        logger.warning("redis_not_ready", extra={"error_type": type(exc).__name__})
        return False


def neo4j_ready(container: ServiceContainer) -> bool:
    try:
        container.graph.verify()
        return True
    except Exception as exc:
        logger.warning("neo4j_not_ready", extra={"error_type": type(exc).__name__})
        return False
