"""Apply Neo4j constraints and the optional environment-verification seed."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from neo4j import GraphDatabase

REPO_ROOT = Path(__file__).resolve().parents[1]
CONSTRAINTS = REPO_ROOT / "neo4j" / "constraints" / "001_constraints.cypher"
SEED = REPO_ROOT / "neo4j" / "seed" / "verify_environment.cypher"


def cypher_statements(path: Path) -> list[str]:
    kept_lines: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("//"):
            continue
        kept_lines.append(line)
    return [part.strip() for part in "\n".join(kept_lines).split(";") if part.strip()]


def apply(path: Path, uri: str, user: str, password: str) -> None:
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        with driver.session() as session:
            for statement in cypher_statements(path):
                session.run(statement)
    finally:
        driver.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seed",
        action="store_true",
        help="Load the small environment-verification graph after constraints.",
    )
    args = parser.parse_args()
    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "aedis_password")
    apply(CONSTRAINTS, uri, user, password)
    if args.seed:
        apply(SEED, uri, user, password)


if __name__ == "__main__":
    main()
