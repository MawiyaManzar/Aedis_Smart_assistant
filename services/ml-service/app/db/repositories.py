"""Postgres repositories (SQLAlchemy Core, parameterised SQL only).

Every method takes an open ``Connection`` so callers compose several writes in one transaction
(``with engine.begin() as conn``). Nothing here commits on its own.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Connection, Engine, text

from app.features.history import HistoricalTransaction
from app.schemas.transaction import TransactionEvent


class TransactionRepository:
    def insert(self, conn: Connection, event: TransactionEvent) -> bool:
        """Idempotent on transaction id. Returns True when a new row was written."""
        result = conn.execute(
            text(
                """INSERT INTO transactions
                   (id, tenant_id, from_account_id, to_account_id, amount, currency, channel,
                    device_id, ip_address, occurred_at)
                   VALUES (:id, :tenant, :src, :dst, :amount, :currency, :channel,
                           :device, :ip, :ts)
                   ON CONFLICT (id) DO NOTHING"""
            ),
            {
                "id": event.transaction_id, "tenant": event.tenant_id,
                "src": event.from_account_id, "dst": event.to_account_id,
                "amount": event.amount, "currency": event.currency, "channel": event.channel,
                "device": event.device_id, "ip": event.ip_address, "ts": event.timestamp,
            },
        )  # fmt: skip
        return bool(result.rowcount)


class PostgresHistoryProvider:
    """``HistoryProvider`` backed by the ``transactions`` table (strictly ``< before``)."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def outgoing_history(
        self, tenant_id: UUID, account_id: str, before: datetime, lookback: timedelta
    ) -> Sequence[HistoricalTransaction]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                text(
                    """SELECT id, to_account_id, amount, occurred_at, device_id
                       FROM transactions
                       WHERE tenant_id = :tenant AND from_account_id = :acct
                         AND occurred_at >= :start AND occurred_at < :before
                       ORDER BY occurred_at"""
                ),
                {"tenant": tenant_id, "acct": account_id, "start": before - lookback,
                 "before": before},
            ).all()  # fmt: skip
        return [HistoricalTransaction(r[0], r[1], float(r[2]), r[3], r[4]) for r in rows]

    def device_first_seen(self, tenant_id: UUID, device_id: str) -> datetime | None:
        with self._engine.connect() as conn:
            value = conn.execute(
                text(
                    "SELECT min(occurred_at) FROM transactions "
                    "WHERE tenant_id = :tenant AND device_id = :device"
                ),
                {"tenant": tenant_id, "device": device_id},
            ).scalar()
        return value


class FraudEventRepository:
    def upsert(
        self,
        conn: Connection,
        *,
        tenant_id: UUID,
        transaction_id: UUID,
        fraud_score: float,
        status: str,
        graph_hops: int | None,
        graph_status: str,
        fraud_ring_ids: list[str],
        model_version: str,
        features: dict[str, Any],
        inference_latency_ms: float,
        shap_values: list[dict[str, Any]] | None = None,
    ) -> UUID:
        """One event per (transaction, model version); re-scoring updates it in place."""
        row = conn.execute(
            text(
                """INSERT INTO fraud_events
                   (tenant_id, transaction_id, fraud_score, status, graph_hops, graph_status,
                    fraud_ring_ids, model_version, features_snap, inference_latency_ms,
                    shap_values)
                   VALUES (:tenant, :tx, :score, :status, :hops, :gstatus, :rings, :mv,
                           CAST(:features AS jsonb), :latency, CAST(:shap AS jsonb))
                   ON CONFLICT (transaction_id, model_version) DO UPDATE SET
                     fraud_score = EXCLUDED.fraud_score, status = EXCLUDED.status,
                     graph_hops = EXCLUDED.graph_hops, graph_status = EXCLUDED.graph_status,
                     fraud_ring_ids = EXCLUDED.fraud_ring_ids,
                     features_snap = EXCLUDED.features_snap,
                     inference_latency_ms = EXCLUDED.inference_latency_ms,
                     shap_values = COALESCE(EXCLUDED.shap_values, fraud_events.shap_values),
                     scored_at = now()
                   RETURNING id"""
            ),
            {
                "tenant": tenant_id, "tx": transaction_id, "score": round(fraud_score, 4),
                "status": status, "hops": graph_hops, "gstatus": graph_status,
                "rings": fraud_ring_ids, "mv": model_version, "features": json.dumps(features),
                "latency": inference_latency_ms,
                "shap": json.dumps(shap_values) if shap_values is not None else None,
            },
        ).scalar_one()  # fmt: skip
        return UUID(str(row))

    def get(self, conn: Connection, tenant_id: UUID, event_id: UUID) -> dict[str, Any] | None:
        row = conn.execute(
            text("SELECT * FROM fraud_events WHERE id = :id AND tenant_id = :tenant"),
            {"id": event_id, "tenant": tenant_id},
        ).mappings().first()  # fmt: skip
        return dict(row) if row else None


class DistressScoreRepository:
    def insert(
        self,
        conn: Connection,
        *,
        tenant_id: UUID,
        borrower_id: UUID,
        distress_score: int,
        risk_band: str,
        model_version: str,
        features: dict[str, Any],
        evaluated_at: datetime,
        shap_values: list[dict[str, Any]] | None = None,
    ) -> UUID:
        row = conn.execute(
            text(
                """INSERT INTO loan_distress_scores
                   (tenant_id, borrower_id, distress_score, risk_band, model_version,
                    features_snap, evaluated_at, shap_values)
                   VALUES (:tenant, :borrower, :score, :band, :mv, CAST(:features AS jsonb),
                           :at, CAST(:shap AS jsonb))
                   RETURNING id"""
            ),
            {
                "tenant": tenant_id, "borrower": borrower_id, "score": distress_score,
                "band": risk_band, "mv": model_version, "features": json.dumps(features),
                "at": evaluated_at,
                "shap": json.dumps(shap_values) if shap_values is not None else None,
            },
        ).scalar_one()  # fmt: skip
        return UUID(str(row))


class AuditRepository:
    """Append-only: the application role has no UPDATE/DELETE on ``audit_log``."""

    def append(
        self,
        conn: Connection,
        *,
        tenant_id: UUID | None,
        entity_type: str,
        entity_id: UUID,
        event_type: str,
        actor: str,
        payload: dict[str, Any],
    ) -> None:
        conn.execute(
            text(
                """INSERT INTO audit_log
                   (tenant_id, entity_type, entity_id, event_type, actor, payload)
                   VALUES (:tenant, :etype, :eid, :event, :actor, CAST(:payload AS jsonb))"""
            ),
            {
                "tenant": tenant_id, "etype": entity_type, "eid": entity_id,
                "event": event_type, "actor": actor, "payload": json.dumps(payload, default=str),
            },
        )  # fmt: skip


class ModelVersionRepository:
    def register(self, conn: Connection, metadata: dict[str, Any], artifact_path: str) -> None:
        """Record a model artifact (idempotent on name+version)."""
        conn.execute(
            text(
                """INSERT INTO model_versions
                   (model_name, model_version, feature_version, feature_list, metrics,
                    artifact_path, trained_at, data_source)
                   VALUES (:name, :version, :fv, CAST(:flist AS jsonb), CAST(:metrics AS jsonb),
                           :path, :trained, :source)
                   ON CONFLICT (model_name, model_version) DO NOTHING"""
            ),
            {
                "name": metadata["model_name"], "version": metadata["model_version"],
                "fv": metadata["feature_version"], "flist": json.dumps(metadata["feature_list"]),
                "metrics": json.dumps(metadata.get("metrics", {})), "path": artifact_path,
                "trained": metadata["trained_at"],
                "source": metadata.get("data_source", "synthetic"),
            },
        )  # fmt: skip
