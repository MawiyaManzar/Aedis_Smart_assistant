from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

from app.core.errors import DependencyUnavailableError
from app.graph.client import GraphClient, GraphUnavailableError
from app.graph.service import GraphSyncService
from app.schemas.transaction import TransactionEvent


class FlakyClient:
    def __init__(self, failures: int) -> None:
        self.failures = failures
        self.calls = 0

    def write(self, work: Any, *args: Any, **kwargs: Any) -> tuple[int, int, int]:
        self.calls += 1
        if self.calls <= self.failures:
            raise GraphUnavailableError("neo4j down")
        return (0, 1, 3)


def _event() -> TransactionEvent:
    return TransactionEvent(
        tenant_id=uuid4(), transaction_id=uuid4(), from_account_id="a", to_account_id="b",
        amount=10, currency="USD", channel="web", timestamp=datetime.now(UTC),
    )  # fmt: skip


def _service(client: FlakyClient) -> GraphSyncService:
    return GraphSyncService(client, max_attempts=3, backoff_seconds=0)  # type: ignore[arg-type]


def test_transient_failure_is_retried_then_succeeds() -> None:
    client = FlakyClient(failures=2)
    service = _service(client)
    result = service.sync(_event())
    assert client.calls == 3 and result.relationships_created == 1
    assert service.counts == {"synced": 1, "replayed": 0, "failed": 0, "retried": 2}


def test_persistent_failure_raises_dependency_error() -> None:
    client = FlakyClient(failures=99)
    service = _service(client)
    with pytest.raises(DependencyUnavailableError):
        service.sync(_event())
    assert client.calls == 3 and service.counts["failed"] == 1


def test_graph_client_type_is_accepted() -> None:
    assert GraphClient  # the service is typed against the real client
