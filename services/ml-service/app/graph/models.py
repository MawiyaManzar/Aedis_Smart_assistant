"""Typed graph outputs. The input type is :class:`app.schemas.transaction.TransactionEvent`."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class SyncResult(BaseModel):
    """What one sync call changed. All zeros on an exact replay."""

    transaction_id: UUID
    nodes_created: int
    relationships_created: int
    properties_set: int
    duration_ms: float
    replayed: bool = Field(description="True when the event changed no structure")


class GraphEnrichment(BaseModel):
    """Bounded graph lookup used by fraud scoring (see ``app.graph.queries``)."""

    status: str = Field(description="OK or DEGRADED")
    graph_hops: int | None
    fraud_ring_ids: list[str] = Field(default_factory=list)
    suspicious_accounts: list[str] = Field(default_factory=list)
    reason: str | None = None
    duration_ms: float = 0.0
