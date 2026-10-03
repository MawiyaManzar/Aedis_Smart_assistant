from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from app.features import fraud_features as ff
from app.features.config import (
    FLAG_BASELINE_INSUFFICIENT,
    FLAG_DEVICE_MISSING,
    FLAG_GRAPH_UNAVAILABLE,
    FLAG_IP_MISSING,
    GRAPH_HOPS_UNKNOWN,
    FraudFeatureConfig,
)
from app.features.fraud import FRAUD_FEATURE_ORDER, FraudFeatureBuilder, to_vector
from app.features.history import HistoricalTransaction, InMemoryHistoryProvider
from app.schemas.transaction import TransactionEvent

CFG = FraudFeatureConfig()
TENANT = UUID("11111111-1111-1111-1111-111111111111")
NOW = datetime(2026, 10, 5, 3, 30, tzinfo=UTC)  # a Monday, 03:30 UTC


def _tx(amount: float, ago: timedelta, to: str = "b1", device: str | None = None):
    return HistoricalTransaction(uuid4(), to, amount, NOW - ago, device)


def _event(**overrides: object) -> TransactionEvent:
    base: dict[str, object] = {
        "tenant_id": TENANT,
        "transaction_id": uuid4(),
        "from_account_id": "a1",
        "to_account_id": "b1",
        "amount": 100.0,
        "currency": "USD",
        "channel": "mobile",
        "device_id": "dev-1",
        "ip_address": "198.51.100.4",
        "timestamp": NOW,
    }
    base.update(overrides)
    return TransactionEvent.model_validate(base)


def _history(amounts: list[float]) -> list[HistoricalTransaction]:
    return [_tx(a, timedelta(days=i + 1)) for i, a in enumerate(amounts)]


# ---- amount_zscore ---------------------------------------------------------------------------


def test_zscore_known_value() -> None:
    history = _history([90, 100, 110, 100, 100])  # mean 100, sample std sqrt(50)
    z, ok = ff.amount_zscore(120, history, NOW, CFG)
    assert ok
    assert z == pytest.approx(20 / 50**0.5)


def test_zscore_is_clipped() -> None:
    z, _ = ff.amount_zscore(1_000_000, _history([90, 100, 110, 100, 100]), NOW, CFG)
    assert z == CFG.zscore_clip
    z, _ = ff.amount_zscore(0.01, _history([5000, 5100, 4900, 5000, 5050]), NOW, CFG)
    assert z == -CFG.zscore_clip


def test_zscore_insufficient_history_returns_zero_and_flag() -> None:
    assert ff.amount_zscore(500, _history([100, 100, 100, 100]), NOW, CFG) == (0.0, False)
    assert ff.amount_zscore(500, [], NOW, CFG) == (0.0, False)


def test_zscore_constant_history_uses_std_floor_not_divide_by_zero() -> None:
    history = _history([100.0] * 5)  # std = 0, floor = max(0.05*100, 1.0) = 5
    z, ok = ff.amount_zscore(110, history, NOW, CFG)
    assert ok
    assert z == pytest.approx(2.0)


def test_zscore_ignores_history_outside_baseline_window() -> None:
    recent = _history([100, 100, 100, 100, 100])
    old = [_tx(50_000, timedelta(days=60 + i)) for i in range(10)]
    z_with_old, _ = ff.amount_zscore(110, recent + old, NOW, CFG)
    z_without, _ = ff.amount_zscore(110, recent, NOW, CFG)
    assert z_with_old == z_without


def test_zscore_ignores_non_finite_history_amounts() -> None:
    history = _history([90, 100, 110, 100, 100]) + [_tx(float("nan"), timedelta(hours=2))]
    z, ok = ff.amount_zscore(120, history, NOW, CFG)
    assert ok
    assert z == pytest.approx(20 / 50**0.5)


def test_prior_excludes_future_and_the_event_itself() -> None:
    event_id = uuid4()
    rows = [
        _tx(1, timedelta(hours=1)),
        HistoricalTransaction(event_id, "b1", 999, NOW, None),
        _tx(2, -timedelta(hours=1)),  # in the future
    ]
    kept = ff.prior(rows, NOW, exclude=event_id)
    assert [r.amount for r in kept] == [1]


# ---- velocity --------------------------------------------------------------------------------


def test_velocity_window_is_half_open() -> None:
    rows = [
        _tx(1, timedelta(hours=1)),  # exactly at the window start -> included
        _tx(1, timedelta(hours=1, seconds=1)),  # just outside
        _tx(1, timedelta(minutes=10)),
        _tx(1, timedelta(hours=23)),
        _tx(1, timedelta(hours=25)),
    ]
    assert ff.velocity(rows, NOW, timedelta(hours=1)) == 2
    assert ff.velocity(rows, NOW, timedelta(hours=24)) == 4


def test_velocity_empty_is_zero() -> None:
    assert ff.velocity([], NOW, timedelta(hours=1)) == 0


# ---- beneficiary / device --------------------------------------------------------------------


def test_is_new_beneficiary() -> None:
    rows = [_tx(1, timedelta(days=2), to="known")]
    assert ff.is_new_beneficiary(rows, "stranger") is True
    assert ff.is_new_beneficiary(rows, "known") is False
    assert ff.is_new_beneficiary([], "anyone") is True


def test_device_age_days() -> None:
    assert ff.device_age_days(NOW - timedelta(days=3, hours=12), NOW) == pytest.approx(3.5)
    assert ff.device_age_days(None, NOW) == 0.0
    assert ff.device_age_days(NOW, NOW) == 0.0
    assert ff.device_age_days(NOW + timedelta(days=1), NOW) == 0.0


# ---- ip / channel / time ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("ip", "expected", "present"),
    [
        ("203.0.113.50", 0.9, True),
        ("198.51.100.4", 0.5, True),
        ("192.168.1.20", 0.1, True),
        ("8.8.8.8", 0.3, True),
        ("2001:db8::1", 0.3, True),
        (None, 0.5, False),
        ("", 0.5, False),
        ("not-an-ip", 0.5, False),
    ],
)
def test_ip_country_risk(ip: str | None, expected: float, present: bool) -> None:
    assert ff.ip_country_risk(ip, CFG.ip_risk_table) == (expected, present)


def test_channel_risk_score() -> None:
    assert ff.channel_risk_score("atm", CFG.channel_risk) == (0.6, True)
    assert ff.channel_risk_score("ATM", CFG.channel_risk) == (0.6, True)
    assert ff.channel_risk_score("pigeon", CFG.channel_risk) == (0.5, False)


def test_time_features_use_utc() -> None:
    assert ff.hour_of_day(NOW) == 3
    assert ff.day_of_week(NOW) == 0  # Monday
    ist = TransactionEvent.model_validate(
        {
            "tenant_id": TENANT,
            "transaction_id": uuid4(),
            "from_account_id": "a",
            "to_account_id": "b",
            "amount": 1,
            "channel": "web",
            "timestamp": "2026-10-05T01:00:00+05:30",  # 19:30 UTC the previous day (Sunday)
        }
    )
    assert ff.hour_of_day(ist.timestamp) == 19
    assert ff.day_of_week(ist.timestamp) == 6


# ---- builder ---------------------------------------------------------------------------------


def _provider() -> InMemoryHistoryProvider:
    provider = InMemoryHistoryProvider()
    for i, amount in enumerate([90, 100, 110, 100, 100, 100]):
        provider.add(
            _event(amount=amount, timestamp=NOW - timedelta(days=i + 1), device_id="dev-1")
        )
    provider.add(_event(amount=100, timestamp=NOW - timedelta(minutes=30), to_account_id="b9"))
    return provider


def test_builder_end_to_end_values() -> None:
    result = FraudFeatureBuilder().build(_event(amount=500), _provider(), graph_hops=2)
    f = result.features
    assert f.amount_zscore > 3
    assert f.velocity_1h == 1
    assert f.velocity_24h == 2  # the 30-minute-old one and the 1-day-old one is at exactly 24h
    assert f.graph_hops == 2
    assert f.is_new_beneficiary is False  # b1 was paid before
    assert f.device_age_days == pytest.approx(6.0)
    assert f.ip_country_risk == 0.5
    assert (f.hour_of_day, f.day_of_week) == (3, 0)
    assert f.channel_risk_score == 0.3
    assert result.flags == []


def test_builder_is_deterministic() -> None:
    event = _event(amount=321.0)
    builder = FraudFeatureBuilder()
    assert builder.build(event, _provider(), 1) == builder.build(event, _provider(), 1)


def test_builder_ignores_future_events_in_provider() -> None:
    provider = _provider()
    event = _event(amount=500)
    baseline = FraudFeatureBuilder().build(event, provider, 1)
    provider.add(_event(amount=999_999, timestamp=NOW + timedelta(hours=1)))
    provider.add(_event(amount=999_999, timestamp=NOW + timedelta(days=2), to_account_id="zz"))
    assert FraudFeatureBuilder().build(event, provider, 1) == baseline


def test_builder_excludes_the_event_if_already_in_history() -> None:
    provider = _provider()
    event = _event(amount=500)
    before = FraudFeatureBuilder().build(event, provider, 1)
    provider.add(event)
    assert FraudFeatureBuilder().build(event, provider, 1).features == before.features


def test_builder_flags_missing_inputs_and_unknown_graph() -> None:
    event = _event(device_id=None, ip_address=None)
    result = FraudFeatureBuilder().build(event, InMemoryHistoryProvider(), graph_hops=None)
    assert set(result.flags) == {
        FLAG_BASELINE_INSUFFICIENT,
        FLAG_DEVICE_MISSING,
        FLAG_IP_MISSING,
        FLAG_GRAPH_UNAVAILABLE,
    }
    assert result.features.graph_hops == GRAPH_HOPS_UNKNOWN
    assert result.features.device_age_days == 0.0
    assert result.features.velocity_1h == 0


def test_tenant_isolation_in_history() -> None:
    provider = _provider()
    other_tenant = _event(tenant_id=UUID("22222222-2222-2222-2222-222222222222"), amount=500)
    result = FraudFeatureBuilder().build(other_tenant, provider, 1)
    assert FLAG_BASELINE_INSUFFICIENT in result.flags
    assert result.features.is_new_beneficiary is True


def test_to_vector_order_and_types() -> None:
    result = FraudFeatureBuilder().build(_event(amount=500), _provider(), graph_hops=4)
    vector = to_vector(result.features)
    assert len(vector) == len(FRAUD_FEATURE_ORDER) == 10
    assert FRAUD_FEATURE_ORDER[:4] == ("amount_zscore", "velocity_1h", "velocity_24h", "graph_hops")
    assert vector[FRAUD_FEATURE_ORDER.index("is_new_beneficiary")] == 0.0
    assert vector[FRAUD_FEATURE_ORDER.index("graph_hops")] == 4.0
