"""Reference (pure Python) definition of the hop-distance semantics.

Training data generation uses this to compute ``graph_hops``; the Neo4j query in
``app.graph.queries`` implements the same definition and is cross-checked against it in tests.

Definition: nodes are accounts, devices and IPs; edges are TRANSACTED_WITH, SHARES_DEVICE and
SHARES_IP treated as undirected. ``distance(x)`` is the length of the shortest path from account
``x`` to any flagged (fraud-ring) account, or ``None`` if it is longer than ``max_hops``.
The score-time value for a transaction is ``min(distance(sender), 1 + distance(beneficiary))``:
the new transfer would add one TRANSACTED_WITH edge to the beneficiary.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Mapping, Set

Node = tuple[str, str]  # (kind, key) e.g. ("acct", "a1"), ("dev", "d1"), ("ip", "1.2.3.4")


def account(account_id: str) -> Node:
    return ("acct", account_id)


def distance_to_flagged(
    adjacency: Mapping[Node, Set[Node]],
    flagged: Set[Node],
    start: Node,
    max_hops: int,
) -> int | None:
    """Breadth-first shortest distance from ``start`` to any node in ``flagged``."""
    if start in flagged:
        return 0
    seen = {start}
    queue: deque[tuple[Node, int]] = deque([(start, 0)])
    while queue:
        node, depth = queue.popleft()
        if depth == max_hops:
            continue
        for neighbour in adjacency.get(node, ()):
            if neighbour in seen:
                continue
            if neighbour in flagged:
                return depth + 1
            seen.add(neighbour)
            queue.append((neighbour, depth + 1))
    return None


def transaction_hops(
    adjacency: Mapping[Node, Set[Node]],
    flagged: Set[Node],
    sender: str,
    beneficiary: str,
    max_hops: int,
    no_connection: int,
) -> int:
    """Score-time ``graph_hops``: ``no_connection`` when nothing flagged is within reach."""
    best: int | None = distance_to_flagged(adjacency, flagged, account(sender), max_hops)
    via_beneficiary = distance_to_flagged(adjacency, flagged, account(beneficiary), max_hops - 1)
    if via_beneficiary is not None:
        candidate = via_beneficiary + 1
        best = candidate if best is None else min(best, candidate)
    return no_connection if best is None else best
