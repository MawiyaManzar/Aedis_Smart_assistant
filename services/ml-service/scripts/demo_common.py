"""Shared helpers for the demo scripts (stdlib HTTP client, env loading, Postgres setup).

The demos only print values returned by the running service, Postgres, Redis or Neo4j. All demo
data is synthetic and says nothing about real-bank performance.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, NoReturn
from uuid import UUID

DEMO_TENANT_NAME = "Aedis Demo Tenant (synthetic data)"
EXIT_UNREACHABLE = 2
EXIT_HTTP_ERROR = 3
EXIT_DEPENDENCY = 4


class DemoError(RuntimeError):
    def __init__(self, message: str, exit_code: int = 1) -> None:
        super().__init__(message)
        self.exit_code = exit_code


def load_root_env() -> None:
    """Fill missing environment variables from the repo-root ``.env`` (never overrides)."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / ".env"
        if candidate.is_file() and (parent / "docker-compose.yml").exists():
            for raw in candidate.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())
            return


def base_url(argument: str | None) -> str:
    return (argument or os.environ.get("AEDIS_ML_URL") or "http://localhost:8000").rstrip("/")


def plain_dsn(url: str) -> str:
    """psycopg wants ``postgresql://``; SQLAlchemy URLs carry a ``+psycopg`` driver suffix."""
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def sqlalchemy_url(url: str) -> str:
    return url if "+psycopg" in url else url.replace("postgresql://", "postgresql+psycopg://", 1)


def admin_database_url() -> str:
    url = os.environ.get("MIGRATION_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise DemoError(
            "Set MIGRATION_DATABASE_URL (or DATABASE_URL) to reach Postgres.", EXIT_DEPENDENCY
        )
    return url


def app_database_url() -> str:
    url = os.environ.get("DATABASE_URL") or os.environ.get("MIGRATION_DATABASE_URL")
    if not url:
        raise DemoError("Set DATABASE_URL to reach Postgres.", EXIT_DEPENDENCY)
    return url


def http_json(
    method: str, url: str, body: dict[str, Any] | None = None, timeout: float = 30.0
) -> tuple[int, dict[str, Any]]:
    """Return ``(status, parsed_json)``. Raises ``DemoError`` when the service is unreachable."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        url, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return exc.code, {"raw": raw.decode(errors="replace")}
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
        raise DemoError(
            f"ML service unreachable at {url}: {exc}. Start the stack "
            "(docker compose up -d) or pass the base URL / set AEDIS_ML_URL.",
            EXIT_UNREACHABLE,
        ) from exc


def require_service(base: str) -> None:
    """Fail fast, with a clear message, when the service does not answer ``/health``."""
    status, _ = http_json("GET", f"{base}/health", timeout=5.0)
    if status != 200:
        raise DemoError(
            f"ML service at {base} answered /health with HTTP {status}.", EXIT_UNREACHABLE
        )


def post_or_fail(url: str, body: dict[str, Any]) -> dict[str, Any]:
    status, payload = http_json("POST", url, body)
    if status != 200:
        raise DemoError(
            f"POST {url} returned HTTP {status}: {json.dumps(payload, sort_keys=True)}",
            EXIT_HTTP_ERROR,
        )
    return payload


def ensure_tenant(tenant_id: UUID) -> None:
    """Insert the permanent demo tenant (no-op when it already exists)."""
    import psycopg

    try:
        with psycopg.connect(plain_dsn(admin_database_url()), connect_timeout=5) as conn:
            conn.execute(
                "INSERT INTO tenants (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                (tenant_id, DEMO_TENANT_NAME),
            )
    except psycopg.Error as exc:
        raise DemoError(
            f"Postgres unavailable or tenants table missing: {exc}", EXIT_DEPENDENCY
        ) from exc


def fail(error: DemoError) -> NoReturn:
    print(f"ERROR: {error}", file=sys.stderr)
    raise SystemExit(error.exit_code)
