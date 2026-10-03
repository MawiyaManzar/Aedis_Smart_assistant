"""HTTP router assembly."""

from fastapi import APIRouter

from app.api import (
    alerts,
    dashboard_graph,
    dashboard_metrics,
    distress,
    explain,
    fraud,
    health,
    internal,
    transactions,
)

api_router = APIRouter()
api_router.include_router(dashboard_metrics.router, prefix="/v1")
api_router.include_router(health.router)
api_router.include_router(internal.router)
api_router.include_router(fraud.router, prefix="/v1")
api_router.include_router(distress.router, prefix="/v1")
api_router.include_router(explain.router, prefix="/v1")
api_router.include_router(transactions.router, prefix="/v1")
api_router.include_router(dashboard_graph.router, prefix="/v1")
api_router.include_router(alerts.router, prefix="/v1")
