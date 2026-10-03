"""Response models for the dashboard metrics endpoint."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FraudStatusCounts(BaseModel):
    approved: int = Field(ge=0)
    flagged: int = Field(ge=0)
    blocked: int = Field(ge=0)


class ResolutionCounts(BaseModel):
    pending: int = Field(ge=0)
    resolved: int = Field(ge=0)


class RiskBandCounts(BaseModel):
    low: int = Field(ge=0)
    medium: int = Field(ge=0)
    high: int = Field(ge=0)
    critical: int = Field(ge=0)


class DashboardMetrics(BaseModel):
    tenant_id: UUID
    since: datetime
    until: datetime
    fraud_events_total: int = Field(ge=0)
    fraud_events_by_status: FraudStatusCounts
    flagged_blocked_rate: float | None = Field(
        default=None, ge=0, le=1, description="(FLAGGED+BLOCKED)/total; null when no events"
    )
    resolutions: ResolutionCounts
    distress_by_risk_band: RiskBandCounts
    inference_latency_avg_ms: float | None = None
    inference_latency_p95_ms: float | None = None
    graph_degraded_count: int = Field(ge=0)
    transactions_count: int = Field(ge=0)
