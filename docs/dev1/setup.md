# Developer 1 local setup

Python side of Aedis only. The Next.js app and API gateway stay Node.js projects.

## Python

- Interpreter: CPython 3.11 (`services/ml-service/.python-version`)
- Package manager: [uv](https://docs.astral.sh/uv/)
- Project: `services/ml-service`
- Lockfile: `services/ml-service/uv.lock`

`requires-python` is `>=3.11,<3.12`. Do not use the system 3.12 interpreter for this service.

If `uv` is missing on Windows:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

## uv commands

Run these from `services/ml-service`:

```powershell
uv python install 3.11
uv python pin 3.11
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
uv run pytest
uv run ruff check app tests
uv run ruff format --check app tests
uv run mypy app
uv run alembic upgrade head
```

`uv sync` creates `services/ml-service/.venv`. Do not commit that directory.

## Environment

Copy the repo-root example if you want explicit values. Compose already has the same local defaults.

```powershell
Copy-Item .env.example .env
```

`.env` is gitignored. The values in `.env.example` are local placeholders, not production credentials.

| Variable | Local default |
| --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://aedis_admin:aedis_password@localhost:5432/aedis_db` |
| `REDIS_URL` | `redis://localhost:6379/0` |
| `NEO4J_URI` | `bolt://localhost:7687` |
| `NEO4J_USER` / `NEO4J_PASSWORD` | `neo4j` / `aedis_password` |
| `MODEL_ENV` | `local` |

Inside Compose, `DATABASE_URL` and `NEO4J_URI` use the service DNS names `postgres` and `neo4j`.

## Docker

From the repository root:

```powershell
docker compose up -d --build
docker compose ps
```

`docker-compose.yml` starts PostgreSQL, Redis, Neo4j, and the Python ML service. It does not start the API gateway or the Next.js dashboard.

First boot of PostgreSQL runs `infra/postgres/init.sql`. Later schema changes go through Alembic. If the tables already exist, revision `001_initial` records itself and does not run the SQL again.

Apply Neo4j constraints after Neo4j is healthy:

```powershell
uv run --project services/ml-service python scripts/apply_neo4j_schema.py --seed
```

Constraints and the seed are defined in Python (`services/ml-service/app/graph/schema.py` and `seed.py`) so the Docker image carries them. `--seed` loads a deterministic 7-event graph: three ordinary accounts and a three-account ring (`ring-seed-001`) sharing one device and one documentation IP (`203.0.113.50`). It is a verification fixture, not the full demo scenario set.

Graph model: `(Account)-[:TRANSACTED_WITH {transactionId}]->(Account)`, `(Account)-[:SHARES_DEVICE]->(Device)`, `(Account)-[:SHARES_IP]->(IPAddress)`. Two accounts share a device or IP when they point at the same node. `Device.id` and `IPAddress.ip` are global (per the execution plan); accounts are tenant-scoped.

## Services and ports

| Service | Container | Port |
| --- | --- | --- |
| PostgreSQL 16 | `aedis-postgres` | 5432 |
| Redis 7.2 | `aedis-redis` | 6379 |
| Neo4j 5.18 HTTP | `aedis-neo4j` | 7474 |
| Neo4j Bolt | `aedis-neo4j` | 7687 |
| ML service | `aedis-ml-service` | 8000 |

Host ports above are the Compose defaults. On a machine that already runs PostgreSQL on 5432 or Redis-compatible Memurai on 6379, `localhost` reaches those local servers instead of the containers. Move `POSTGRES_PORT` and `REDIS_PORT` in a gitignored `.env`, and point host `DATABASE_URL` / `REDIS_URL` at the new ports. This development machine uses host ports 5433 and 6380 for that reason. Container-to-container URLs stay on 5432 and 6379.

## Tests

From `services/ml-service`:

```powershell
uv run pytest
uv run ruff check app tests
uv run ruff format --check app tests
uv run mypy app
```

The pytest suite checks Python 3.11, service startup, the health endpoint, importability of the ML libraries, and the stub response contracts. It does not require Docker.

## Health checks

Process liveness does not call the databases:

```powershell
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/version
```

Expected liveness body: `{"status":"ok","service":"aedis-ml-service"}`.

`/version` reports `inference_mode: "stub"` until real weights exist.

Dependency readiness:

```powershell
curl http://127.0.0.1:8000/health/ready
```

`200` means Postgres, Redis, and Neo4j all answered. `503` means at least one did not. The body names which checks passed.

Direct checks:

```powershell
docker exec aedis-postgres pg_isready -U aedis_admin -d aedis_db
docker exec aedis-redis redis-cli ping
docker exec aedis-neo4j cypher-shell -u neo4j -p aedis_password "RETURN 1"
```

## Migrations

From `services/ml-service`, with Postgres already running:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://aedis_admin:aedis_password@localhost:5432/aedis_db"
uv run alembic upgrade head
```

A fresh Compose volume already applied `init.sql`, so revision `001_initial` is a no-op there. Revision `002_integrity` is **required** on every database: it adds tenant-scoped foreign keys, the `fraud_events.resolution` check, the `model_versions` registry, the TRUNCATE guard on `audit_log`, and the restricted `aedis_app` login role.

Roles:

- `aedis_admin` (schema owner) runs migrations. Set `MIGRATION_DATABASE_URL` for it.
- `aedis_app` is what the service uses (`DATABASE_URL`). It has DML on business tables but only `SELECT`/`INSERT` on `audit_log`. Its password comes from `AEDIS_APP_PASSWORD`.

Integration tests (need the stack and `uv run alembic upgrade head`) live in `tests/integration`. They skip when Postgres is unreachable; set `AEDIS_REQUIRE_INTEGRATION=1` to make that a failure. They run inside rolled-back transactions and never write permanent rows (audit rows cannot be deleted).

## Model artifacts

No model files are shipped. `FRAUD_MODEL_PATH` and `DISTRESS_MODEL_PATH` are optional. Setting them does not load weights in this phase. Scoring endpoints stay in `inference_mode = "stub"` and return null scores.
