"""HTTP router assembly."""

from fastapi import APIRouter

from app.api import distress, explain, fraud, health, internal, transactions

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(internal.router)
api_router.include_router(fraud.router, prefix="/v1")
api_router.include_router(distress.router, prefix="/v1")
api_router.include_router(explain.router, prefix="/v1")
api_router.include_router(transactions.router, prefix="/v1")
