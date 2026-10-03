"""Alert resolution against real Postgres (role aedis_app)."""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import UUID, uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from tests.integration.conftest import _app_url, _connect, _owner_url

from app.core.config import Settings
from app.main import create_app

# Audit rows are append-only and reference the tenant, so the tenant is permanent; only
# fraud_events/transactions are cleaned.
TENANT = UUID("00000000-0000-4000-8000-0000000000e3")
OTHER_TENANT = UUID("00000000-0000-4000-8000-0000000000e4")

PATHS = [
    ["OVERRIDE_APPROVE"],
    ["CONFIRM_BLOCK"],
    ["STEP_UP_SENT", "STEP_UP_PASSED", "OVERRIDE_APPROVE"],
    ["STEP_UP_SENT", "STEP_UP_FAILED", "CONFIRM_BLOCK"],
    ["STEP_UP_SENT", "STEP_UP_FAILED", "ESCALATE", "OVERRIDE_APPROVE"],
    ["STEP_UP_SENT", "ESCALATE", "CONFIRM_BLOCK"],
    ["ESCALATE", "OVERRIDE_APPROVE"],
]


@pytest.fixture(scope="module")
def owner() -> Iterator[psycopg.Connection]:
    conn = _connect(_owner_url())
    for tid in (TENANT, OTHER_TENANT):
        conn.execute(
            "INSERT INTO tenants (id, name) VALUES (%s, 'alerts-test') ON CONFLICT DO NOTHING",
            (tid,),
        )
    conn.commit()
    yield conn
    for tid in (TENANT, OTHER_TENANT):
        conn.execute("DELETE FROM fraud_events WHERE tenant_id = %s", (tid,))
        conn.execute("DELETE FROM transactions WHERE tenant_id = %s", (tid,))
    conn.commit()
    conn.close()


@pytest.fixture(scope="module")
def client(owner: psycopg.Connection) -> Iterator[TestClient]:
    with TestClient(create_app(Settings(database_url=_app_url()))) as c:
        yield c


def _alert(owner: psycopg.Connection, tenant: UUID = TENANT) -> UUID:
    tx = owner.execute(
        "INSERT INTO transactions (tenant_id, from_account_id, to_account_id, amount, currency,"
        " channel, occurred_at) VALUES (%s, 'a', 'b', 10, 'USD', 'web', %s) RETURNING id",
        (tenant, datetime.now(UTC)),
    ).fetchone()
    assert tx is not None
    row = owner.execute(
        "INSERT INTO fraud_events (tenant_id, transaction_id, fraud_score, status, model_version)"
        " VALUES (%s, %s, 0.9, 'FLAGGED', %s) RETURNING id",
        (tenant, tx[0], f"t-{uuid4().hex[:8]}"),
    ).fetchone()
    assert row is not None
    owner.commit()
    return UUID(str(row[0]))


def _post(client: TestClient, alert: UUID, resolution: str, tenant: UUID = TENANT, **extra: object):  # noqa: ANN202
    body = {"tenant_id": str(tenant), "resolution": resolution, "resolved_by": "analyst-1"}
    return client.post(f"/v1/alerts/{alert}/resolve", json={**body, **extra})


def _audit_count(owner: psycopg.Connection, alert: UUID) -> int:
    row = owner.execute(
        "SELECT count(*) FROM audit_log WHERE entity_type='FRAUD_EVENT' AND entity_id=%s"
        " AND event_type='RESOLVED'",
        (alert,),
    ).fetchone()
    assert row is not None
    return int(row[0])


def _state(owner: psycopg.Connection, alert: UUID) -> tuple[str, str | None, datetime | None]:
    owner.rollback()
    row = owner.execute(
        "SELECT resolution, resolved_by, resolved_at FROM fraud_events WHERE id=%s", (alert,)
    ).fetchone()
    assert row is not None
    return row[0], row[1], row[2]


@pytest.mark.parametrize("path", PATHS, ids=lambda p: ">".join(p))
def test_every_path(client: TestClient, owner: psycopg.Connection, path: list[str]) -> None:
    alert = _alert(owner)
    prev = "PENDING"
    for i, step in enumerate(path):
        r = _post(client, alert, step, note=f"step {i}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["previous_resolution"] == prev and body["resolution"] == step
        assert body["changed"] is True
        prev = step
        terminal = i == len(path) - 1
        res, by, at = _state(owner, alert)
        assert res == step
        assert (by == "analyst-1" and at is not None) if terminal else (by is None and at is None)
    assert _audit_count(owner, alert) == len(path)
    payloads = owner.execute(
        "SELECT actor, payload FROM audit_log WHERE entity_id=%s AND event_type='RESOLVED'"
        " ORDER BY created_at",
        (alert,),
    ).fetchall()
    chain = ["PENDING", *path]
    for i, (actor, payload) in enumerate(payloads):
        assert actor == "analyst-1"
        assert payload == {"from": chain[i], "to": chain[i + 1], "note": f"step {i}"}


def test_unknown_alert_404(client: TestClient) -> None:
    r = _post(client, uuid4(), "ESCALATE")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_other_tenant_404_and_untouched(client: TestClient, owner: psycopg.Connection) -> None:
    alert = _alert(owner)
    r = _post(client, alert, "ESCALATE", tenant=OTHER_TENANT)
    assert r.status_code == 404
    assert _state(owner, alert)[0] == "PENDING"
    assert _audit_count(owner, alert) == 0


@pytest.mark.parametrize(
    ("setup", "bad"),
    [
        ([], "STEP_UP_PASSED"),
        (["STEP_UP_SENT"], "OVERRIDE_APPROVE"),
        (["OVERRIDE_APPROVE"], "CONFIRM_BLOCK"),
        (["CONFIRM_BLOCK"], "ESCALATE"),
        (["ESCALATE"], "STEP_UP_SENT"),
    ],
)
def test_illegal_transition_409(
    client: TestClient, owner: psycopg.Connection, setup: list[str], bad: str
) -> None:
    alert = _alert(owner)
    for step in setup:
        assert _post(client, alert, step).status_code == 200
    before = _audit_count(owner, alert)
    r = _post(client, alert, bad)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "CONFLICT"
    assert _audit_count(owner, alert) == before
    assert _state(owner, alert)[0] == (setup[-1] if setup else "PENDING")


def test_idempotent_repeat(client: TestClient, owner: psycopg.Connection) -> None:
    alert = _alert(owner)
    first = _post(client, alert, "CONFIRM_BLOCK")
    again = _post(client, alert, "CONFIRM_BLOCK", resolved_by="someone-else")
    assert first.status_code == again.status_code == 200
    assert again.json()["changed"] is False
    assert again.json()["resolved_by"] == "analyst-1"
    assert again.json()["resolved_at"] == first.json()["resolved_at"]
    assert _audit_count(owner, alert) == 1
    # Non-terminal repeat is idempotent too.
    other = _alert(owner)
    assert _post(client, other, "ESCALATE").status_code == 200
    assert _post(client, other, "ESCALATE").json()["changed"] is False
    assert _audit_count(owner, other) == 1


def test_validation_error(client: TestClient, owner: psycopg.Connection) -> None:
    alert = _alert(owner)
    assert _post(client, alert, "BOGUS").status_code == 422


def test_concurrent_conflicting_resolutions(client: TestClient, owner: psycopg.Connection) -> None:
    alert = _alert(owner)
    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(
            pool.map(
                lambda i: (
                    _post(
                        client, alert, "OVERRIDE_APPROVE" if i % 2 else "CONFIRM_BLOCK"
                    ).status_code
                ),
                range(8),
            )
        )
    winner = _state(owner, alert)[0]
    assert winner in {"OVERRIDE_APPROVE", "CONFIRM_BLOCK"}
    assert sorted(set(codes)) == [200, 409]
    assert _audit_count(owner, alert) == 1


def test_concurrent_identical_resolutions(client: TestClient, owner: psycopg.Connection) -> None:
    alert = _alert(owner)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: _post(client, alert, "ESCALATE"), range(8)))
    assert all(r.status_code == 200 for r in results)
    assert sum(r.json()["changed"] for r in results) == 1
    assert _audit_count(owner, alert) == 1
