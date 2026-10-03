"""Analyst alert resolution: explicit state machine over ``fraud_events.resolution``."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import Engine, text

from app.core.errors import ConflictError, NotFoundError


class Resolution(StrEnum):
    PENDING = "PENDING"
    STEP_UP_SENT = "STEP_UP_SENT"
    STEP_UP_PASSED = "STEP_UP_PASSED"
    STEP_UP_FAILED = "STEP_UP_FAILED"
    OVERRIDE_APPROVE = "OVERRIDE_APPROVE"
    CONFIRM_BLOCK = "CONFIRM_BLOCK"
    ESCALATE = "ESCALATE"


R = Resolution

TRANSITIONS: dict[Resolution, frozenset[Resolution]] = {
    R.PENDING: frozenset({R.STEP_UP_SENT, R.OVERRIDE_APPROVE, R.CONFIRM_BLOCK, R.ESCALATE}),
    R.STEP_UP_SENT: frozenset({R.STEP_UP_PASSED, R.STEP_UP_FAILED, R.ESCALATE}),
    R.STEP_UP_PASSED: frozenset({R.OVERRIDE_APPROVE}),
    R.STEP_UP_FAILED: frozenset({R.CONFIRM_BLOCK, R.ESCALATE}),
    R.ESCALATE: frozenset({R.OVERRIDE_APPROVE, R.CONFIRM_BLOCK}),
    R.OVERRIDE_APPROVE: frozenset(),
    R.CONFIRM_BLOCK: frozenset(),
}
TERMINAL: frozenset[Resolution] = frozenset({R.OVERRIDE_APPROVE, R.CONFIRM_BLOCK})


def can_transition(current: Resolution, target: Resolution) -> bool:
    return target in TRANSITIONS[current]


@dataclass(frozen=True)
class ResolutionResult:
    alert_id: UUID
    tenant_id: UUID
    previous_resolution: Resolution
    resolution: Resolution
    resolved_by: str | None
    resolved_at: datetime | None
    changed: bool


class AlertResolutionService:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def resolve(
        self,
        *,
        alert_id: UUID,
        tenant_id: UUID,
        resolution: Resolution,
        resolved_by: str,
        note: str | None = None,
    ) -> ResolutionResult:
        # Row lock + update + audit append commit (or roll back) together.
        with self._engine.begin() as conn:
            row: Any = conn.execute(
                text(
                    "SELECT resolution, resolved_by, resolved_at FROM fraud_events "
                    "WHERE id = :id AND tenant_id = :tenant FOR UPDATE"
                ),
                {"id": alert_id, "tenant": tenant_id},
            ).first()
            if row is None:
                raise NotFoundError("Alert not found")
            current = Resolution(row[0])

            if resolution == current:
                return ResolutionResult(
                    alert_id, tenant_id, current, current, row[1], row[2], changed=False
                )
            if not can_transition(current, resolution):
                raise ConflictError(
                    f"Illegal resolution transition {current.value} -> {resolution.value}"
                )

            terminal = resolution in TERMINAL
            updated: Any = conn.execute(
                text(
                    """UPDATE fraud_events SET resolution = :res,
                         resolved_by = CASE WHEN CAST(:terminal AS boolean)
                                       THEN CAST(:actor AS text) ELSE resolved_by END,
                         resolved_at = CASE WHEN CAST(:terminal AS boolean)
                                       THEN now() ELSE resolved_at END
                       WHERE id = :id AND tenant_id = :tenant
                       RETURNING resolved_by, resolved_at"""
                ),
                {
                    "res": resolution.value, "terminal": terminal, "actor": resolved_by,
                    "id": alert_id, "tenant": tenant_id,
                },
            ).one()  # fmt: skip
            conn.execute(
                text(
                    """INSERT INTO audit_log
                       (tenant_id, entity_type, entity_id, event_type, actor, payload)
                       VALUES (:tenant, 'FRAUD_EVENT', :id, 'RESOLVED', :actor,
                               CAST(:payload AS jsonb))"""
                ),
                {
                    "tenant": tenant_id, "id": alert_id, "actor": resolved_by,
                    "payload": json.dumps(
                        {"from": current.value, "to": resolution.value, "note": note}
                    ),
                },
            )  # fmt: skip
            return ResolutionResult(
                alert_id, tenant_id, current, resolution, updated[0], updated[1], changed=True
            )
