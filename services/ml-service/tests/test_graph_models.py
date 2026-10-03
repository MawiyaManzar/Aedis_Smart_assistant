import json

import pytest
from pydantic import ValidationError

from app.schemas.transaction import TransactionEvent

GATEWAY_PAYLOAD = {
    "transactionId": "8b0b0d0e-6c1a-4f0a-9c2d-1a2b3c4d5e6f",
    "fromAccountId": "acct-1",
    "toAccountId": "acct-2",
    "amount": 120.5,
    "currency": "USD",
    "channel": "mobile",
    "deviceId": "dev-1",
    "ipAddress": "203.0.113.9",
    "timestamp": "2026-10-03T12:00:00.000Z",
}
TENANT = "11111111-1111-1111-1111-111111111111"


def test_parses_gateway_stream_fields() -> None:
    event = TransactionEvent.from_stream_fields(TENANT, json.dumps(GATEWAY_PAYLOAD))
    assert str(event.tenant_id) == TENANT
    assert event.from_account_id == "acct-1"
    assert event.ip_address == "203.0.113.9"


def test_blank_device_and_ip_become_none() -> None:
    payload = {**GATEWAY_PAYLOAD, "deviceId": "", "ipAddress": ""}
    event = TransactionEvent.from_stream_fields(TENANT, json.dumps(payload))
    assert event.device_id is None
    assert event.ip_address is None


def test_rejects_invalid_ip() -> None:
    payload = {**GATEWAY_PAYLOAD, "ipAddress": "not-an-ip"}
    with pytest.raises(ValidationError):
        TransactionEvent.from_stream_fields(TENANT, json.dumps(payload))


def test_rejects_non_positive_amount() -> None:
    payload = {**GATEWAY_PAYLOAD, "amount": 0}
    with pytest.raises(ValidationError):
        TransactionEvent.from_stream_fields(TENANT, json.dumps(payload))
