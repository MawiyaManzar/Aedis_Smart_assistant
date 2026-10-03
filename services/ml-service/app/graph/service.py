"""GraphSyncService: reliable, observable, idempotent transaction -> Neo4j synchronization."""

from __future__ import annotations

import logging
import threading
import time

from app.core.errors import DependencyUnavailableError
from app.graph.client import GraphClient, GraphError, GraphUnavailableError
from app.graph.models import SyncResult
from app.graph.sync import sync_transaction
from app.schemas.transaction import TransactionEvent

logger = logging.getLogger(__name__)


class GraphSyncService:
    """Retries transient failures a bounded number of times and counts outcomes.

    The write itself is idempotent (MERGE on natural keys / transactionId), so retrying a write
    whose acknowledgement was lost is always safe.
    """

    def __init__(
        self, client: GraphClient, max_attempts: int = 3, backoff_seconds: float = 0.2
    ) -> None:
        self._client = client
        self._max_attempts = max_attempts
        self._backoff = backoff_seconds
        self._lock = threading.Lock()
        self._counts = {"synced": 0, "replayed": 0, "failed": 0, "retried": 0}

    @property
    def counts(self) -> dict[str, int]:
        with self._lock:
            return dict(self._counts)

    def _bump(self, name: str) -> None:
        with self._lock:
            self._counts[name] += 1

    def sync(self, event: TransactionEvent) -> SyncResult:
        last: Exception | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                result = sync_transaction(self._client, event)
            except GraphError as exc:
                last = exc
                if attempt < self._max_attempts:
                    self._bump("retried")
                    logger.warning(
                        "graph_sync_retry",
                        extra={
                            "transaction_id": str(event.transaction_id),
                            "attempt": attempt,
                            "reason": str(exc),
                        },
                    )
                    time.sleep(self._backoff * attempt)
                continue
            self._bump("replayed" if result.replayed else "synced")
            logger.info(
                "graph_synced",
                extra={
                    "transaction_id": str(event.transaction_id),
                    "tenant_id": str(event.tenant_id),
                    "replayed": result.replayed,
                    "nodes_created": result.nodes_created,
                    "relationships_created": result.relationships_created,
                    "duration_ms": result.duration_ms,
                },
            )
            return result
        self._bump("failed")
        logger.error(
            "graph_sync_failed",
            extra={"transaction_id": str(event.transaction_id), "reason": str(last)},
        )
        raise DependencyUnavailableError(f"graph sync failed: {last}") from last


__all__ = ["GraphSyncService", "GraphUnavailableError"]
