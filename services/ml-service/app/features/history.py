"""Transaction-history access used by feature computation."""

from __future__ import annotations

from bisect import bisect_left
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol
from uuid import UUID

from app.schemas.transaction import TransactionEvent


@dataclass(frozen=True)
class HistoricalTransaction:
    transaction_id: UUID
    to_account_id: str
    amount: float
    occurred_at: datetime
    device_id: str | None = None


class HistoryProvider(Protocol):
    """Read-only history source. Implementations may return more than asked; the feature
    functions re-apply the time filter, so a sloppy provider cannot leak the future."""

    def outgoing_history(
        self, tenant_id: UUID, account_id: str, before: datetime, lookback: timedelta
    ) -> Sequence[HistoricalTransaction]:
        """Outgoing transactions of ``account_id`` in ``[before - lookback, before)``."""
        ...

    def device_first_seen(self, tenant_id: UUID, device_id: str) -> datetime | None:
        """Earliest time any account of the tenant used ``device_id``, or ``None``."""
        ...


class InMemoryHistoryProvider:
    """Indexed in-memory history for tests, training, and demos."""

    def __init__(self, events: Iterable[TransactionEvent] = ()) -> None:
        self._by_sender: dict[tuple[UUID, str], list[HistoricalTransaction]] = defaultdict(list)
        self._times: dict[tuple[UUID, str], list[datetime]] = {}
        self._device_first: dict[tuple[UUID, str], datetime] = {}
        for event in events:
            self.add(event)

    def add(self, event: TransactionEvent) -> None:
        key = (event.tenant_id, event.from_account_id)
        record = HistoricalTransaction(
            event.transaction_id,
            event.to_account_id,
            event.amount,
            event.timestamp,
            event.device_id,
        )
        rows = self._by_sender[key]
        rows.append(record)
        rows.sort(key=lambda r: r.occurred_at)
        self._times[key] = [r.occurred_at for r in rows]
        if event.device_id:
            dkey = (event.tenant_id, event.device_id)
            current = self._device_first.get(dkey)
            if current is None or event.timestamp < current:
                self._device_first[dkey] = event.timestamp

    def outgoing_history(
        self, tenant_id: UUID, account_id: str, before: datetime, lookback: timedelta
    ) -> Sequence[HistoricalTransaction]:
        key = (tenant_id, account_id)
        rows = self._by_sender.get(key, [])
        times = self._times.get(key, [])
        start = bisect_left(times, before - lookback)
        end = bisect_left(times, before)
        return rows[start:end]

    def device_first_seen(self, tenant_id: UUID, device_id: str) -> datetime | None:
        return self._device_first.get((tenant_id, device_id))
