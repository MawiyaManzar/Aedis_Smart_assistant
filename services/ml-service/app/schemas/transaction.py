"""Transaction event as published by the API gateway. Shared by features, graph, and scoring."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from ipaddress import ip_address
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class TransactionEvent(BaseModel):
    """Gateway transaction (camelCase on the wire) plus the tenant id.

    The gateway puts ``tenantId`` next to the JSON ``payload`` on the stream entry, so
    :meth:`from_stream_fields` merges the two. Snake_case names are accepted as well.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tenant_id: UUID
    transaction_id: UUID
    from_account_id: str = Field(min_length=1)
    to_account_id: str = Field(min_length=1)
    amount: float = Field(gt=0, allow_inf_nan=False)
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

    @field_validator("timestamp")
    @classmethod
    def _to_utc(cls, value: datetime) -> datetime:
        """Naive timestamps are treated as UTC; aware ones are converted to UTC."""
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    @classmethod
    def from_stream_fields(cls, tenant_id: str, payload: str) -> TransactionEvent:
        data: dict[str, Any] = json.loads(payload)
        data["tenantId"] = tenant_id
        return cls.model_validate(data)
