"""Dependency checks for the readiness endpoint."""

import logging

from neo4j import GraphDatabase
from redis import Redis
from sqlalchemy import create_engine, text

from app.core.config import Settings

logger = logging.getLogger(__name__)


def postgres_ready(settings: Settings) -> bool:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": int(settings.readiness_timeout_seconds)},
    )
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("postgres readiness check failed: %s", type(exc).__name__)
        return False
    finally:
        engine.dispose()


def redis_ready(settings: Settings) -> bool:
    client = Redis.from_url(
        settings.redis_url,
        socket_connect_timeout=settings.readiness_timeout_seconds,
    )
    try:
        return bool(client.ping())
    except Exception as exc:
        logger.warning("redis readiness check failed: %s", type(exc).__name__)
        return False
    finally:
        client.close()


def neo4j_ready(settings: Settings) -> bool:
    driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
        connection_timeout=settings.readiness_timeout_seconds,
    )
    try:
        driver.verify_connectivity()
        return True
    except Exception as exc:
        logger.warning("neo4j readiness check failed: %s", type(exc).__name__)
        return False
    finally:
        driver.close()
