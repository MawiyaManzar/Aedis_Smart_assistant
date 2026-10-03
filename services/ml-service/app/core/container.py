"""Service container: shared clients and model handles, created once per process.

The container lives on ``app.state`` (created in the FastAPI lifespan) rather than in a
module-level singleton, so tests can build isolated apps.
"""

from __future__ import annotations

import logging

from fastapi import Request
from redis import Redis
from sqlalchemy import Engine, create_engine

from app.core.config import Settings
from app.explainability.shap_explainer import ShapExplainService
from app.graph.client import GraphClient
from app.graph.queries import GraphEnricher
from app.graph.service import GraphSyncService
from app.inference.distress import DistressInferenceService
from app.inference.fraud import FraudInferenceService
from app.models.loaders import (
    LightGbmDistressModelLoader,
    ModelArtifactError,
    ModelLoader,
    ModelStatus,
    OnnxFraudModelLoader,
)

logger = logging.getLogger(__name__)


class ServiceContainer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.engine: Engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_size=5,
            connect_args={"connect_timeout": int(settings.readiness_timeout_seconds)},
        )
        self.redis: Redis = Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=settings.readiness_timeout_seconds,
            socket_timeout=settings.readiness_timeout_seconds,
        )
        self.graph = GraphClient(
            settings.neo4j_uri,
            settings.neo4j_user,
            settings.neo4j_password,
            connection_timeout=settings.readiness_timeout_seconds,
        )
        self.graph_sync = GraphSyncService(self.graph)
        self.graph_enricher = GraphEnricher(self.graph, settings.graph_query_timeout_seconds)
        self.fraud_loader = OnnxFraudModelLoader(
            settings.artifacts_dir, settings.fraud_model_version
        )
        self.distress_loader = LightGbmDistressModelLoader(
            settings.artifacts_dir, settings.distress_model_version
        )
        self.fraud = FraudInferenceService(self.fraud_loader)
        self.distress = DistressInferenceService(self.distress_loader)
        self.explainer = ShapExplainService(self.fraud_loader, self.distress_loader)

    @property
    def loaders(self) -> tuple[ModelLoader, ...]:
        return (self.fraud_loader, self.distress_loader)

    def load_models(self) -> None:
        """Load every model once. Missing artifacts abort startup only if required."""
        self.graph_enricher.warm_up()
        for loader in self.loaders:
            try:
                loader.load()
            except ModelArtifactError as exc:
                if self.settings.require_models:
                    raise
                logger.error(
                    "model_unavailable",
                    extra={
                        "model": loader.name,
                        "model_version": loader.version,
                        "reason": str(exc),
                    },
                )

    def model_statuses(self) -> list[ModelStatus]:
        return [loader.status() for loader in self.loaders]

    def close(self) -> None:
        self.graph.close()
        self.redis.close()
        self.engine.dispose()


def get_container(request: Request) -> ServiceContainer:
    container: ServiceContainer = request.app.state.container
    return container
