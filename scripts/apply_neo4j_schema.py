"""Apply Neo4j constraints and the optional deterministic seed graph.

Run from the repo root:
    uv run --project services/ml-service python scripts/apply_neo4j_schema.py --seed
The schema and seed live in ``services/ml-service/app/graph`` (single source of truth).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "ml-service"))

from app.graph.client import GraphClient
from app.graph.schema import apply_schema
from app.graph.seed import apply_seed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", action="store_true", help="also load the deterministic seed")
    args = parser.parse_args()
    client = GraphClient(
        os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
        os.environ.get("NEO4J_USER", "neo4j"),
        os.environ.get("NEO4J_PASSWORD", "aedis_password"),
    )
    try:
        client.verify()
        apply_schema(client)
        print("schema applied")
        if args.seed:
            print(f"seed applied: {apply_seed(client)} events")
    finally:
        client.close()


if __name__ == "__main__":
    main()
