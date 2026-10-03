"""Read-only aggregate queries for dashboard metrics (Postgres only, tenant-scoped)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Connection, text

from app.schemas.metrics import (
    DashboardMetrics,
    FraudStatusCounts,
    ResolutionCounts,
    RiskBandCounts,
)

_FRAUD_SQL = text(
    """SELECT
         count(*) AS total,
         count(*) FILTER (WHERE status = 'APPROVED') AS approved,
         count(*) FILTER (WHERE status = 'FLAGGED') AS flagged,
         count(*) FILTER (WHERE status = 'BLOCKED') AS blocked,
         count(*) FILTER (WHERE resolution = 'PENDING') AS pending,
         count(*) FILTER (WHERE resolution <> 'PENDING') AS resolved,
         count(*) FILTER (WHERE graph_status = 'DEGRADED') AS degraded,
         avg(inference_latency_ms) AS lat_avg,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY inference_latency_ms) AS lat_p95
       FROM fraud_events
       WHERE tenant_id = :tenant AND scored_at >= :since AND scored_at <= :until"""
)

_DISTRESS_SQL = text(
    """SELECT risk_band, count(*) AS n FROM (
         SELECT DISTINCT ON (borrower_id) risk_band, evaluated_at
         FROM loan_distress_scores
         WHERE tenant_id = :tenant AND evaluated_at <= :until
         ORDER BY borrower_id, evaluated_at DESC, id DESC
       ) latest
       WHERE evaluated_at >= :since
       GROUP BY risk_band"""
)

_TX_SQL = text(
    """SELECT count(*) FROM transactions
       WHERE tenant_id = :tenant AND occurred_at >= :since AND occurred_at <= :until"""
)


def compute_dashboard_metrics(
    conn: Connection, tenant_id: UUID, since: datetime, until: datetime
) -> DashboardMetrics:
    params = {"tenant": tenant_id, "since": since, "until": until}
    f = conn.execute(_FRAUD_SQL, params).mappings().one()
    bands = {
        str(r["risk_band"]): int(r["n"]) for r in conn.execute(_DISTRESS_SQL, params).mappings()
    }
    tx_count = int(conn.execute(_TX_SQL, params).scalar_one())
    total = int(f["total"])
    flagged, blocked = int(f["flagged"]), int(f["blocked"])
    return DashboardMetrics(
        tenant_id=tenant_id,
        since=since,
        until=until,
        fraud_events_total=total,
        fraud_events_by_status=FraudStatusCounts(
            approved=int(f["approved"]), flagged=flagged, blocked=blocked
        ),
        flagged_blocked_rate=(flagged + blocked) / total if total else None,
        resolutions=ResolutionCounts(pending=int(f["pending"]), resolved=int(f["resolved"])),
        distress_by_risk_band=RiskBandCounts(
            low=bands.get("LOW", 0),
            medium=bands.get("MEDIUM", 0),
            high=bands.get("HIGH", 0),
            critical=bands.get("CRITICAL", 0),
        ),
        inference_latency_avg_ms=None if f["lat_avg"] is None else float(f["lat_avg"]),
        inference_latency_p95_ms=None if f["lat_p95"] is None else float(f["lat_p95"]),
        graph_degraded_count=int(f["degraded"]),
        transactions_count=tx_count,
    )
