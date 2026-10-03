"""Bounded graph enrichment for fraud scoring.

Implements the semantics defined in ``app.graph.reference``: ``graph_hops =
min(d(sender), 1 + d(beneficiary))`` where ``d`` is the shortest undirected path (over
TRANSACTED_WITH / SHARES_DEVICE / SHARES_IP) to an account carrying ``fraudRingId``, limited to
3 hops. Any graph failure or timeout yields a DEGRADED result with ``graph_hops = -1`` instead
of an exception, so scoring can continue without the graph.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from neo4j import ManagedTransaction

from app.features.config import GRAPH_HOPS_UNKNOWN, GRAPH_MAX_HOPS, GRAPH_NO_CONNECTION
from app.graph.client import GraphClient, GraphError
from app.graph.models import GraphEnrichment

logger = logging.getLogger(__name__)
MAX_REPORTED = 10

_DISTANCE = f"""
MATCH (x:Account {{id: $account_id, tenantId: $tenant_id}})
OPTIONAL MATCH p = (x)-[:TRANSACTED_WITH|SHARES_DEVICE|SHARES_IP*1..{GRAPH_MAX_HOPS}]-(f:Account)
  WHERE f.tenantId = $tenant_id AND f.fraudRingId IS NOT NULL AND f <> x
WITH x, p, f, length(p) AS d
ORDER BY d
WITH x, collect({{d: d, id: f.id, ring: f.fraudRingId}})[..$limit] AS found
RETURN x.fraudRingId AS own_ring, found
"""


@dataclass(frozen=True)
class _Reach:
    distance: int | None
    accounts: list[str]
    rings: list[str]


def _reach(tx: ManagedTransaction, tenant_id: str, account_id: str, max_hops: int) -> _Reach:
    record = tx.run(_DISTANCE, tenant_id=tenant_id, account_id=account_id, limit=50).single()
    if record is None:  # account not in the graph yet: nothing is known about it
        return _Reach(None, [], [])
    if record["own_ring"] is not None:
        return _Reach(0, [account_id], [str(record["own_ring"])])
    found = [f for f in record["found"] if f["d"] is not None and f["d"] <= max_hops]
    if not found:
        return _Reach(None, [], [])
    best = min(f["d"] for f in found)
    nearest = [f for f in found if f["d"] == best]
    return _Reach(
        best,
        sorted({f["id"] for f in nearest})[:MAX_REPORTED],
        sorted({f["ring"] for f in nearest})[:MAX_REPORTED],
    )


class GraphEnricher:
    def __init__(self, client: GraphClient, timeout_seconds: float = 0.5) -> None:
        self._client = client
        self._timeout = timeout_seconds

    def warm_up(self) -> None:
        """Pay one-off connection/query-planning cost at startup (best effort)."""
        try:
            self._client.read(_reach, "warm-up", "warm-up", GRAPH_MAX_HOPS, timeout=5.0)
        except GraphError as exc:
            logger.warning("graph_warmup_failed", extra={"reason": str(exc)})

    def enrich(self, tenant_id: str, sender: str, beneficiary: str) -> GraphEnrichment:
        started = time.perf_counter()
        try:
            own = self._client.read(
                _reach, tenant_id, sender, GRAPH_MAX_HOPS, timeout=self._timeout
            )
            other = self._client.read(
                _reach, tenant_id, beneficiary, GRAPH_MAX_HOPS - 1, timeout=self._timeout
            )
        except GraphError as exc:
            elapsed = (time.perf_counter() - started) * 1000
            logger.warning("graph_enrichment_degraded", extra={"reason": str(exc)})
            return GraphEnrichment(
                status="DEGRADED",
                graph_hops=GRAPH_HOPS_UNKNOWN,
                reason=str(exc),
                duration_ms=round(elapsed, 3),
            )
        candidates: list[tuple[int, _Reach]] = []
        if own.distance is not None:
            candidates.append((own.distance, own))
        if other.distance is not None:
            candidates.append((other.distance + 1, other))
        elapsed = (time.perf_counter() - started) * 1000
        if not candidates:
            return GraphEnrichment(
                status="OK",
                graph_hops=GRAPH_NO_CONNECTION,
                duration_ms=round(elapsed, 3),
            )
        hops, reach = min(candidates, key=lambda c: c[0])
        return GraphEnrichment(
            status="OK",
            graph_hops=hops,
            fraud_ring_ids=reach.rings,
            suspicious_accounts=reach.accounts,
            duration_ms=round(elapsed, 3),
        )
