"""Deterministic loan-distress demo (synthetic borrowers only).

Usage (from services/ml-service)::

    uv run python scripts/demo_loan_distress.py [BASE_URL]   # default http://localhost:8000

Healthy vs deteriorating borrowers -> ``build_distress_features`` -> Redis ``BorrowerFeatureStore``
-> read back -> ``POST /v1/models/distress/score-batch`` -> persisted with
``DistressScoreRepository`` -> printed. Re-runnable: a score row is only inserted when none exists
for the same borrower, model version and evaluation time.
"""

from __future__ import annotations

import random
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID, uuid5

sys.path.insert(0, str(Path(__file__).resolve().parent))

from demo_common import (  # noqa: E402
    EXIT_DEPENDENCY,
    DemoError,
    admin_database_url,
    app_database_url,
    base_url,
    ensure_tenant,
    fail,
    load_root_env,
    plain_dsn,
    post_or_fail,
    require_service,
    sqlalchemy_url,
)

from app.features.distress import build_distress_features  # noqa: E402
from app.graph.seed import SEED_TENANT_ID  # noqa: E402
from app.schemas.features import DistressFeatures, DistressFeatureSource  # noqa: E402

DEMO_TENANT_ID = SEED_TENANT_ID
NAMESPACE = UUID("00000000-0000-4000-8000-00000000d3a1")
RNG_SEED = 20261003
EVALUATION_DATE = date(2026, 2, 1)
EVALUATED_AT = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)
HEALTHY = 4
DETERIORATING = 4


@dataclass(frozen=True)
class DemoBorrower:
    borrower_id: UUID
    label: str
    profile: str  # "healthy" | "deteriorating"
    source: DistressFeatureSource


def build_borrowers() -> list[DemoBorrower]:
    """Pure and deterministic. Profiles are illustrative inputs, not observed customers."""
    rng = random.Random(RNG_SEED)
    out: list[DemoBorrower] = []
    for i in range(HEALTHY):
        base = rng.uniform(4000.0, 9000.0)
        atm_28d = rng.uniform(300.0, 500.0)
        label = f"healthy-{i + 1:02d}"
        out.append(
            DemoBorrower(
                uuid5(NAMESPACE, label),
                label,
                "healthy",
                DistressFeatureSource(
                    borrower_id=uuid5(NAMESPACE, label),
                    avg_balance_60d=round(base, 2),
                    avg_balance_30d=round(base * rng.uniform(0.97, 1.05), 2),
                    atm_28d=round(atm_28d, 2),
                    atm_14d=round(atm_28d / 2 * rng.uniform(0.85, 1.15), 2),
                    new_high_interest_count=0,
                ),
            )
        )
    for i in range(DETERIORATING):
        base = rng.uniform(4000.0, 9000.0)
        atm_28d = rng.uniform(300.0, 500.0)
        label = f"deteriorating-{i + 1:02d}"
        out.append(
            DemoBorrower(
                uuid5(NAMESPACE, label),
                label,
                "deteriorating",
                DistressFeatureSource(
                    borrower_id=uuid5(NAMESPACE, label),
                    avg_balance_60d=round(base, 2),
                    avg_balance_30d=round(base * rng.uniform(0.35, 0.6), 2),
                    atm_28d=round(atm_28d, 2),
                    atm_14d=round(atm_28d * rng.uniform(0.75, 0.9), 2),
                    new_high_interest_count=2 + i % 3,
                ),
            )
        )
    return out


def build_features(borrowers: list[DemoBorrower]) -> dict[UUID, DistressFeatures]:
    return {b.borrower_id: build_distress_features(b.source) for b in borrowers}


def batch_body(features: dict[UUID, DistressFeatures]) -> dict[str, object]:
    return {
        "evaluation_date": EVALUATION_DATE.isoformat(),
        "borrowers": [
            {"borrower_id": str(bid), "features": f.model_dump()} for bid, f in features.items()
        ],
    }


def ensure_borrowers(borrowers: list[DemoBorrower]) -> None:
    import psycopg

    try:
        with psycopg.connect(plain_dsn(admin_database_url()), connect_timeout=5) as conn:
            for b in borrowers:
                conn.execute(
                    "INSERT INTO borrowers (id, tenant_id, external_ref) VALUES (%s, %s, %s) "
                    "ON CONFLICT (id) DO NOTHING",
                    (b.borrower_id, DEMO_TENANT_ID, f"demo:{b.label}"),
                )
    except psycopg.Error as exc:
        raise DemoError(f"Postgres unavailable: {exc}", EXIT_DEPENDENCY) from exc


def run(url: str) -> None:
    from redis import Redis
    from redis.exceptions import RedisError
    from sqlalchemy import create_engine, text

    from app.core.config import get_settings
    from app.core.errors import DependencyUnavailableError
    from app.db.repositories import DistressScoreRepository
    from app.featurestore.borrower import BorrowerFeatureStore

    borrowers = build_borrowers()
    features = build_features(borrowers)
    require_service(url)
    ensure_tenant(DEMO_TENANT_ID)
    ensure_borrowers(borrowers)

    store = BorrowerFeatureStore(Redis.from_url(get_settings().redis_url, socket_timeout=5))
    try:
        written = store.put_many(features, computed_at=EVALUATED_AT)
        read_back = store.get_many(features.keys())
    except (DependencyUnavailableError, RedisError) as exc:
        raise DemoError(f"Redis unavailable: {exc}", EXIT_DEPENDENCY) from exc
    if read_back != features:
        raise DemoError("Feature store read-back differs from what was written.", 1)
    print(f"wrote {written} borrower feature hashes to Redis and read them back identically")

    body = post_or_fail(f"{url}/v1/models/distress/score-batch", batch_body(read_back))
    results = {UUID(r["borrower_id"]): r for r in body["scores"]}

    engine = create_engine(sqlalchemy_url(app_database_url()))
    repo = DistressScoreRepository()
    inserted = 0
    with engine.begin() as conn:
        for b in borrowers:
            r = results[b.borrower_id]
            exists = conn.execute(
                text(
                    "SELECT 1 FROM loan_distress_scores WHERE borrower_id = :b AND "
                    "model_version = :mv AND evaluated_at = :at"
                ),
                {"b": b.borrower_id, "mv": body["model_version"], "at": EVALUATED_AT},
            ).first()
            if exists:
                continue
            repo.insert(
                conn,
                tenant_id=DEMO_TENANT_ID,
                borrower_id=b.borrower_id,
                distress_score=r["distress_score"],
                risk_band=r["risk_band"],
                model_version=body["model_version"],
                features=read_back[b.borrower_id].model_dump(),
                evaluated_at=EVALUATED_AT,
            )
            inserted += 1
    engine.dispose()

    print(
        f"model={body['model_version']} feature_version={body['feature_version']} "
        f"evaluation_date={body['evaluation_date']} "
        f"inference_latency_ms={body['inference_latency_ms']}"
    )
    print(
        f"persisted {inserted} new loan_distress_scores rows "
        f"({len(borrowers) - inserted} already present)"
    )
    print(
        f"{'borrower':<18}{'profile':<15}{'drop%':>8}{'atm_spike':>11}{'new_credit':>12}"
        f"{'score':>7}  band"
    )
    for b in borrowers:
        f, r = read_back[b.borrower_id], results[b.borrower_id]
        print(
            f"{b.label:<18}{b.profile:<15}{f.balance_drop_pct:>8.2f}{f.atm_spike_ratio:>11.2f}"
            f"{f.new_credit_count:>12}{r['distress_score']:>7}  {r['risk_band']}"
        )
    print("\nSynthetic data only: these numbers do not describe real-bank performance.")


def main(argv: list[str]) -> int:
    load_root_env()
    try:
        run(base_url(argv[1] if len(argv) > 1 else None))
    except DemoError as exc:
        fail(exc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
