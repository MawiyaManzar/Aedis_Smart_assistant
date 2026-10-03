"""Shared fixtures for tests that need the Docker Compose stack."""

from __future__ import annotations

import os
from collections.abc import Iterator

import psycopg
import pytest
from sqlalchemy import Engine, create_engine


def _dsn(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://")


def _owner_url() -> str:
    return os.environ.get(
        "MIGRATION_DATABASE_URL",
        "postgresql+psycopg://aedis_admin:aedis_password@localhost:5433/aedis_db",
    )


def _app_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://aedis_app:aedis_app_password@localhost:5433/aedis_db",
    )


def _connect(url: str) -> psycopg.Connection:
    try:
        return psycopg.connect(_dsn(url), connect_timeout=3)
    except psycopg.OperationalError as exc:
        if os.environ.get("AEDIS_REQUIRE_INTEGRATION") == "1":
            raise
        pytest.skip(f"PostgreSQL not reachable: {type(exc).__name__}")


@pytest.fixture
def owner_conn() -> Iterator[psycopg.Connection]:
    """Schema-owner connection. Always rolled back so tests leave no rows."""
    conn = _connect(_owner_url())
    try:
        yield conn
    finally:
        conn.rollback()
        conn.close()


@pytest.fixture
def app_conn() -> Iterator[psycopg.Connection]:
    """Connection as the restricted aedis_app role. Always rolled back."""
    conn = _connect(_app_url())
    try:
        role = conn.execute("SELECT current_user").fetchone()
        assert role == ("aedis_app",), f"app_conn must be aedis_app, got {role}"
        conn.rollback()
        yield conn
    finally:
        conn.rollback()
        conn.close()


@pytest.fixture
def app_engine() -> Iterator[Engine]:
    """SQLAlchemy engine as aedis_app (skips if Postgres is unreachable)."""
    _connect(_app_url()).close()
    engine = create_engine(_app_url())
    yield engine
    engine.dispose()
