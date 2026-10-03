"""Bounded, tenant-scoped neighbourhood extraction in Cytoscape.js element format.

The neighbourhood is expanded breadth-first in at most ``depth`` (1..3) steps over
TRANSACTED_WITH / SHARES_DEVICE / SHARES_IP (undirected). Every step is a single bounded
query; the total node count never exceeds ``node_cap`` (``meta.truncated`` tells the caller).
Account nodes must belong to the requested tenant; Device/IPAddress nodes are shared
infrastructure and are only reached through tenant accounts.
"""

from __future__ import annotations

from typing import Any

from neo4j import ManagedTransaction
from pydantic import BaseModel

from app.graph.client import GraphClient

MAX_DEPTH = 3
DEFAULT_DEPTH = 2
DEFAULT_NODE_CAP = 200
MAX_EDGES = 1000

_REL = "TRANSACTED_WITH|SHARES_DEVICE|SHARES_IP"

_CENTER = """
MATCH (x:Account {id: $account_id, tenantId: $tenant_id})
RETURN elementId(x) AS eid, labels(x) AS labels, properties(x) AS props
"""

_EXPAND = f"""
MATCH (a) WHERE elementId(a) IN $frontier
MATCH (a)-[:{_REL}]-(n)
WHERE NOT elementId(n) IN $seen
  AND (n:Device OR n:IPAddress OR (n:Account AND n.tenantId = $tenant_id))
WITH DISTINCT n
RETURN elementId(n) AS eid, labels(n) AS labels, properties(n) AS props
ORDER BY coalesce(n.id, n.ip)
LIMIT $limit
"""

_EDGES = f"""
MATCH (a)-[r:{_REL}]->(b)
WHERE elementId(a) IN $ids AND elementId(b) IN $ids
RETURN elementId(a) AS src, elementId(b) AS dst, type(r) AS type, properties(r) AS props
ORDER BY type(r), src, dst
LIMIT $limit
"""


class GraphView(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    meta: dict[str, Any]


def _public_id(label: str, props: dict[str, Any]) -> str:
    if label == "IPAddress":
        return f"ip:{props['ip']}"
    return f"{label.lower()}:{props['id']}"


def _node(label: str, props: dict[str, Any], distance: int, center: bool) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": _public_id(label, props),
        "label": str(props["ip"] if label == "IPAddress" else props["id"]),
        "type": label,
        "distance": distance,
    }
    if label == "Account":
        ring = props.get("fraudRingId")
        data["fraudRingId"] = ring
        data["flagged"] = ring is not None
        data["isCenter"] = center
    return {"data": data}


def _node_label(labels: list[str]) -> str:
    for candidate in ("Account", "Device", "IPAddress"):
        if candidate in labels:
            return candidate
    return labels[0] if labels else "Unknown"


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None and hasattr(value, "isoformat") else None


def _extract(
    tx: ManagedTransaction, tenant_id: str, account_id: str, depth: int, node_cap: int
) -> GraphView | None:
    center = tx.run(_CENTER, tenant_id=tenant_id, account_id=account_id).single()
    if center is None:
        return None
    eids: dict[str, dict[str, Any]] = {}  # element id -> node element
    eids[center["eid"]] = _node("Account", dict(center["props"]), 0, True)
    frontier = [center["eid"]]
    truncated = False
    for level in range(1, depth + 1):
        if not frontier:
            break
        room = node_cap - len(eids)
        if room <= 0:
            truncated = True
            break
        rows = list(
            tx.run(
                _EXPAND,
                frontier=frontier,
                seen=list(eids),
                tenant_id=tenant_id,
                limit=room + 1,
            )
        )
        if len(rows) > room:
            truncated = True
            rows = rows[:room]
        frontier = []
        for row in rows:
            label = _node_label(row["labels"])
            eids[row["eid"]] = _node(label, dict(row["props"]), level, False)
            frontier.append(row["eid"])
    edge_rows = list(tx.run(_EDGES, ids=list(eids), limit=MAX_EDGES + 1))
    edges_truncated = len(edge_rows) > MAX_EDGES
    edge_rows = edge_rows[:MAX_EDGES]
    edges: list[dict[str, Any]] = []
    for row in edge_rows:
        source = eids[row["src"]]["data"]["id"]
        target = eids[row["dst"]]["data"]["id"]
        props = dict(row["props"])
        data: dict[str, Any] = {
            "id": str(props.get("transactionId") or f"{source}|{row['type']}|{target}"),
            "source": source,
            "target": target,
            "type": row["type"],
        }
        if row["type"] == "TRANSACTED_WITH":
            data["transactionId"] = props.get("transactionId")
            data["amount"] = props.get("amount")
            data["currency"] = props.get("currency")
            data["occurredAt"] = _iso(props.get("occurredAt"))
        edges.append({"data": data})
    nodes = list(eids.values())
    flagged = sum(1 for n in nodes if n["data"].get("flagged"))
    meta = {
        "tenant_id": tenant_id,
        "account_id": account_id,
        "depth": depth,
        "node_cap": node_cap,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "flagged_accounts": flagged,
        "truncated": truncated or edges_truncated,
    }
    return GraphView(nodes=nodes, edges=edges, meta=meta)


class GraphViewService:
    def __init__(self, client: GraphClient, timeout_seconds: float = 5.0) -> None:
        self._client = client
        self._timeout = timeout_seconds

    def neighbourhood(
        self,
        tenant_id: str,
        account_id: str,
        depth: int = DEFAULT_DEPTH,
        node_cap: int = DEFAULT_NODE_CAP,
    ) -> GraphView | None:
        """Return the neighbourhood, or ``None`` if the account is not in the tenant's graph.

        Raises ``GraphError`` (incl. timeouts) on graph failure.
        """
        if not 1 <= depth <= MAX_DEPTH:
            raise ValueError(f"depth must be within 1..{MAX_DEPTH}")
        return self._client.read(
            _extract, tenant_id, account_id, depth, node_cap, timeout=self._timeout
        )
