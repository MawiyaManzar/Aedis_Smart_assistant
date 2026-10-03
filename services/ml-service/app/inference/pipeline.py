"""End-to-end transaction scoring: history -> features -> graph -> model -> persistence.

Order matters for leakage: features and graph enrichment are computed *before* the transaction is
written to Postgres/Neo4j, so a transaction never influences its own score.
"""

from __future__ import annotations

import logging
import time
from uuid import UUID, uuid4

from pydantic import BaseModel, Field
from sqlalchemy import Engine

from app.db.repositories import (
    AuditRepository,
    FraudEventRepository,
    PostgresHistoryProvider,
    TransactionRepository,
)
from app.explainability.shap_explainer import ShapExplainService
from app.features.fraud import FraudFeatureBuilder
from app.graph.queries import GraphEnricher
from app.graph.service import GraphSyncService
from app.inference.fraud import FraudInferenceService
from app.inference.risk_mapping import fraud_status
from app.schemas.explain import FraudExplainRequest, ShapDriver
from app.schemas.fraud import FraudScoreResponse
from app.schemas.transaction import TransactionEvent

logger = logging.getLogger(__name__)
ACTOR = "ml-service"


class TransactionScoreResponse(BaseModel):
    fraud_event_id: UUID
    score: FraudScoreResponse
    fraud_ring_ids: list[str]
    suspicious_accounts: list[str]
    top_drivers: list[ShapDriver] = Field(
        description="Numeric SHAP drivers; only computed for FLAGGED/BLOCKED"
    )
    graph_synced: bool
    total_latency_ms: float


class TransactionScoringService:
    def __init__(
        self,
        engine: Engine,
        fraud: FraudInferenceService,
        enricher: GraphEnricher,
        graph_sync: GraphSyncService,
        explainer: ShapExplainService,
    ) -> None:
        self._engine = engine
        self._fraud = fraud
        self._enricher = enricher
        self._graph_sync = graph_sync
        self._explainer = explainer
        self._history = PostgresHistoryProvider(engine)
        self._builder = FraudFeatureBuilder()
        self._txs, self._events, self._audit = (
            TransactionRepository(),
            FraudEventRepository(),
            AuditRepository(),
        )

    def score(self, event: TransactionEvent) -> TransactionScoreResponse:
        started = time.perf_counter()
        enrichment = self._enricher.enrich(
            str(event.tenant_id), event.from_account_id, event.to_account_id
        )
        built = self._builder.build(event, self._history, graph_hops=enrichment.graph_hops)
        probability, model_ms = self._fraud.predict(built.features)
        status = fraud_status(probability)
        score = FraudScoreResponse(
            transaction_id=event.transaction_id,
            model_version=self._fraud.model_version,
            feature_version=self._fraud.feature_version,
            fraud_probability=min(max(probability, 0.0), 1.0),
            status=status,
            graph_status="OK" if enrichment.status == "OK" else "DEGRADED",
            inference_latency_ms=round(model_ms, 4),
        )
        drivers: list[ShapDriver] = []
        if status != "APPROVED":
            drivers = self._explainer.explain(
                FraudExplainRequest(
                    model_name="fraud",
                    entity_type="FRAUD_EVENT",
                    entity_id=uuid4(),
                    features=built.features,
                    top_n=5,
                )
            ).top_drivers

        with self._engine.begin() as conn:  # one atomic unit: transaction + event + audit
            self._txs.insert(conn, event)
            event_id = self._events.upsert(
                conn,
                tenant_id=event.tenant_id,
                transaction_id=event.transaction_id,
                fraud_score=probability,
                status=status,
                graph_hops=enrichment.graph_hops,
                graph_status=score.graph_status,
                fraud_ring_ids=enrichment.fraud_ring_ids,
                model_version=score.model_version,
                features=built.features.model_dump(),
                inference_latency_ms=score.inference_latency_ms,
                shap_values=[d.model_dump() for d in drivers] or None,
            )
            self._audit.append(
                conn,
                tenant_id=event.tenant_id,
                entity_type="FRAUD_EVENT",
                entity_id=event_id,
                event_type="SCORED",
                actor=ACTOR,
                payload={
                    "transaction_id": str(event.transaction_id),
                    "fraud_score": round(probability, 4),
                    "status": status,
                    "model_version": score.model_version,
                    "graph_status": score.graph_status,
                    "graph_hops": enrichment.graph_hops,
                },
            )

        synced = True
        try:
            self._graph_sync.sync(event)
        except Exception as exc:  # scoring result is already durable; graph can be re-synced
            synced = False
            logger.error(
                "graph_sync_after_score_failed",
                extra={"transaction_id": str(event.transaction_id), "reason": str(exc)},
            )
        return TransactionScoreResponse(
            fraud_event_id=event_id,
            score=score,
            fraud_ring_ids=enrichment.fraud_ring_ids,
            suspicious_accounts=enrichment.suspicious_accounts,
            top_drivers=drivers,
            graph_synced=synced,
            total_latency_ms=round((time.perf_counter() - started) * 1000, 3),
        )
