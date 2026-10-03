"""Neo4j driver lifecycle. One driver per process, created at startup."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any, TypeVar

from neo4j import Driver, GraphDatabase, ManagedTransaction, unit_of_work
from neo4j.exceptions import Neo4jError, ServiceUnavailable

logger = logging.getLogger(__name__)

T = TypeVar("T")


class GraphError(RuntimeError):
    """Any failure talking to Neo4j. Never swallowed silently by callers."""


class GraphUnavailableError(GraphError):
    """Neo4j could not be reached."""


class GraphClient:
    def __init__(
        self,
        uri: str,
        user: str,
        password: str,
        connection_timeout: float = 3.0,
    ) -> None:
        self._driver: Driver = GraphDatabase.driver(
            uri, auth=(user, password), connection_timeout=connection_timeout
        )

    def verify(self) -> None:
        try:
            self._driver.verify_connectivity()
        except (ServiceUnavailable, Neo4jError, OSError) as exc:
            raise GraphUnavailableError(str(exc)) from exc

    def write(self, work: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        try:
            with self._driver.session() as session:
                return session.execute_write(work, *args, **kwargs)
        except ServiceUnavailable as exc:
            raise GraphUnavailableError(str(exc)) from exc
        except Neo4jError as exc:
            raise GraphError(f"{exc.code}: {exc.message}") from exc

    def read(
        self,
        work: Callable[..., T],
        *args: Any,
        timeout: float | None = None,
        **kwargs: Any,
    ) -> T:
        """Run a read transaction. ``timeout`` (seconds) is enforced server-side."""

        def _unit(tx: ManagedTransaction) -> T:
            return work(tx, *args, **kwargs)

        unit: Callable[[ManagedTransaction], T] = _unit
        if timeout is not None:
            unit = unit_of_work(timeout=timeout)(_unit)
        try:
            with self._driver.session() as session:
                return session.execute_read(unit)
        except ServiceUnavailable as exc:
            raise GraphUnavailableError(str(exc)) from exc
        except Neo4jError as exc:
            raise GraphError(f"{exc.code}: {exc.message}") from exc

    def run_write(self, query: str, **params: Any) -> None:
        """Convenience for schema and maintenance statements."""

        def _run(tx: ManagedTransaction) -> None:
            tx.run(query, **params).consume()

        self.write(_run)

    def close(self) -> None:
        self._driver.close()
