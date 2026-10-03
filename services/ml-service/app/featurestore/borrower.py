"""Redis borrower feature store.

Key ``borrower:{borrower_id}:features`` is a hash holding the distress model inputs plus
``computed_at`` (ISO-8601 UTC). Keys expire after ``FEATURE_TTL_SECONDS`` (25 h) so a nightly
refresh that fails leaves visibly stale data for at most a day instead of forever.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from uuid import UUID

from redis import Redis
from redis.exceptions import RedisError

from app.core.errors import DependencyUnavailableError
from app.features.distress import DISTRESS_FEATURE_ORDER
from app.schemas.features import DistressFeatures

logger = logging.getLogger(__name__)
FEATURE_TTL_SECONDS = 90_000


def feature_key(borrower_id: UUID | str) -> str:
    return f"borrower:{borrower_id}:features"


class BorrowerFeatureStore:
    def __init__(self, redis: Redis, ttl_seconds: int = FEATURE_TTL_SECONDS) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    def put_many(
        self,
        items: Mapping[UUID, DistressFeatures],
        computed_at: datetime | None = None,
    ) -> int:
        """Write all borrowers in a single pipeline round-trip. Returns the number written."""
        stamp = (computed_at or datetime.now(UTC)).isoformat()
        try:
            pipe = self._redis.pipeline(transaction=False)
            for borrower_id, features in items.items():
                key = feature_key(borrower_id)
                mapping: dict[str | bytes, str | bytes | float | int] = {
                    name: float(getattr(features, name)) for name in DISTRESS_FEATURE_ORDER
                }
                mapping["computed_at"] = stamp
                pipe.hset(key, mapping=mapping)  # type: ignore[arg-type]
                pipe.expire(key, self._ttl)
            pipe.execute()
        except RedisError as exc:
            raise DependencyUnavailableError(f"redis unavailable: {exc}") from exc
        return len(items)

    def get_many(self, borrower_ids: Iterable[UUID]) -> dict[UUID, DistressFeatures]:
        """Return features for borrowers present in the store; missing/expired are omitted."""
        ids = list(borrower_ids)
        try:
            pipe = self._redis.pipeline(transaction=False)
            for borrower_id in ids:
                pipe.hgetall(feature_key(borrower_id))
            rows = pipe.execute()
        except RedisError as exc:
            raise DependencyUnavailableError(f"redis unavailable: {exc}") from exc
        found: dict[UUID, DistressFeatures] = {}
        for borrower_id, row in zip(ids, rows, strict=True):
            if not row:
                continue
            decoded = {
                (k.decode() if isinstance(k, bytes) else k): (
                    v.decode() if isinstance(v, bytes) else v
                )
                for k, v in row.items()
            }
            try:
                found[borrower_id] = DistressFeatures(
                    avg_balance_30d=float(decoded["avg_balance_30d"]),
                    avg_balance_60d=float(decoded["avg_balance_60d"]),
                    balance_drop_pct=float(decoded["balance_drop_pct"]),
                    atm_spike_ratio=float(decoded["atm_spike_ratio"]),
                    new_credit_count=int(float(decoded["new_credit_count"])),
                )
            except (KeyError, ValueError) as exc:
                logger.warning(
                    "feature_store_corrupt_entry",
                    extra={"borrower_id": str(borrower_id), "reason": repr(exc)},
                )
        return found

    def ttl(self, borrower_id: UUID) -> int:
        try:
            return int(self._redis.ttl(feature_key(borrower_id)))
        except RedisError as exc:
            raise DependencyUnavailableError(f"redis unavailable: {exc}") from exc
