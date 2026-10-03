from __future__ import annotations

import os
from collections.abc import Iterator
from uuid import uuid4

import pytest
from redis import Redis
from redis.exceptions import RedisError

from app.featurestore.borrower import FEATURE_TTL_SECONDS, BorrowerFeatureStore, feature_key
from app.schemas.features import DistressFeatures


@pytest.fixture
def redis_client() -> Iterator[Redis]:
    client = Redis.from_url(
        os.environ.get("REDIS_URL", "redis://localhost:6380/0"), socket_connect_timeout=2
    )
    try:
        client.ping()
    except RedisError as exc:
        if os.environ.get("AEDIS_REQUIRE_INTEGRATION") == "1":
            raise
        pytest.skip(f"Redis not reachable: {type(exc).__name__}")
    yield client
    client.close()


def _features(n: int) -> DistressFeatures:
    return DistressFeatures(
        avg_balance_30d=100.0 * n, avg_balance_60d=200.0 * n, balance_drop_pct=50.0,
        atm_spike_ratio=1.5, new_credit_count=n,
    )  # fmt: skip


def test_roundtrip_ttl_and_missing(redis_client: Redis) -> None:
    store = BorrowerFeatureStore(redis_client)
    a, b, missing = uuid4(), uuid4(), uuid4()
    try:
        assert store.put_many({a: _features(1), b: _features(2)}) == 2
        got = store.get_many([a, b, missing])
        assert set(got) == {a, b}
        assert got[b] == _features(2)
        assert 0 < store.ttl(a) <= FEATURE_TTL_SECONDS
        assert redis_client.hget(feature_key(a), "computed_at") is not None
    finally:
        redis_client.delete(feature_key(a), feature_key(b))


def test_corrupt_entry_is_skipped(redis_client: Redis) -> None:
    store = BorrowerFeatureStore(redis_client)
    bad = uuid4()
    try:
        redis_client.hset(feature_key(bad), mapping={"avg_balance_30d": "not-a-number"})
        assert store.get_many([bad]) == {}
    finally:
        redis_client.delete(feature_key(bad))
