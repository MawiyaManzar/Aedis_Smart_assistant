"""Pure unit tests for the alert resolution transition table."""

from __future__ import annotations

import pytest

from app.services.alert_resolution import TERMINAL, TRANSITIONS, Resolution, can_transition

R = Resolution

ALLOWED = {
    (R.PENDING, R.STEP_UP_SENT),
    (R.PENDING, R.OVERRIDE_APPROVE),
    (R.PENDING, R.CONFIRM_BLOCK),
    (R.PENDING, R.ESCALATE),
    (R.STEP_UP_SENT, R.STEP_UP_PASSED),
    (R.STEP_UP_SENT, R.STEP_UP_FAILED),
    (R.STEP_UP_SENT, R.ESCALATE),
    (R.STEP_UP_PASSED, R.OVERRIDE_APPROVE),
    (R.STEP_UP_FAILED, R.CONFIRM_BLOCK),
    (R.STEP_UP_FAILED, R.ESCALATE),
    (R.ESCALATE, R.OVERRIDE_APPROVE),
    (R.ESCALATE, R.CONFIRM_BLOCK),
}


@pytest.mark.parametrize("current", list(R))
@pytest.mark.parametrize("target", list(R))
def test_full_matrix(current: Resolution, target: Resolution) -> None:
    assert can_transition(current, target) is ((current, target) in ALLOWED)


def test_table_covers_every_state_and_terminals_are_dead_ends() -> None:
    assert set(TRANSITIONS) == set(R)
    assert {r for r, nxt in TRANSITIONS.items() if not nxt} == TERMINAL
    assert TERMINAL == {R.OVERRIDE_APPROVE, R.CONFIRM_BLOCK}


def test_nothing_transitions_back_to_pending() -> None:
    assert all(R.PENDING not in nxt for nxt in TRANSITIONS.values())
