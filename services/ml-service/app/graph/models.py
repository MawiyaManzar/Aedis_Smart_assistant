"""Typed graph inputs and outputs."""

from __future__ import annotations

import json
from datetime import datetime
from ipaddress import ip_address
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class TransactionEvent(BaseModel):
    """Transaction as published by the API gateway (camelCase) plus the tenant id.

    The gateway puts ``tenantId`` next to the JSON ``payload`` on the stream entry, so
    :meth:`from_stream_fields` merges the two.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tenant_id: UUID
    transaction_id: UUID
    from_account_id: str = Field(min_length=1)
    to_account_id: str = Field(min_length=1)
    amount: float = Field(gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    channel: str
    device_id: str | None = None
    ip_address: str | None = None
    timestamp: datetime

    @field_validator("ip_address")
    @classmethod
    def _valid_ip(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return str(ip_address(value))

    @field_validator("device_id")
    @classmethod
    def _blank_device_is_none(cls, value: str | None) -> str | None:
        return value or None

    @classmethod
    def from_stream_fields(cls, tenant_id: str, payload: str) -> TransactionEvent:
        data: dict[str, Any] = json.loads(payload)
        data["tenantId"] = tenant_id
        return cls.model_validate(data)


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
