# Dev2 integration guide (briefing for Developer 2's AI coding agent)

Copy this whole file into your agent as context. Everything below was checked against the code on branch `dev1/foundation-setup`. Where the code and an older doc disagree, **the code wins** (models are real, loaded from the committed artifacts).

Status of endpoints: all endpoints listed in section 4 exist in code on this branch. Items marked **PENDING** do not exist yet.

## 1. Goal and ownership

Goal: wire Developer 2's gateway, workers, policy engine, LLM layer and dashboard to Developer 1's ML/data service (`services/ml-service`, FastAPI, port 8000).

| Developer 1 owns (do NOT edit) | Developer 2 owns (you edit) |
| --- | --- |
| `services/ml-service/**` (API, models, artifacts, graph sync, scripts under `services/ml-service/scripts/`) | `frontend/` (Next.js, Socket.io/SSE, Cytoscape UI) |
| `infra/**` (Postgres init + Alembic migrations) | `services/api-gateway/` (Fastify gateway, JWT/auth) |
| `scripts/**` (e.g. `scripts/apply_neo4j_schema.py`) | Redis Stream consumers / BullMQ workers, orchestration |
| `docker-compose.yml`, `.env.example` | LLM / OpenRouter, LangGraph, policy engine, intervention webhooks |
| Postgres schema, Neo4j schema/seed, model artifacts | Natural-language explanations (ML service returns numeric SHAP only) |

Hard rules:
- Do not edit `services/ml-service`, `infra/`, `scripts/`, `docker-compose.yml`.
- Never change the DB schema directly (no manual `ALTER TABLE`, no editing `infra/postgres/init.sql`). Request a change from Dev1; it ships as an Alembic migration.
- The ML service enforces **no authentication**. Auth/JWT is yours; do not expose port 8000 publicly.

## 2. Getting the code

```powershell
git fetch origin
git checkout <your-dev2-branch>
git merge origin/dev1/foundation-setup   # or: git merge dev1/foundation-setup if local
```

- The M1-M16 work was merged to `main` via PR #1; `origin/dev1/foundation-setup` carries later follow-up fixes. Merge `origin/main` (or the follow-up branch, once its PR is merged).
- Never force-push. Never merge to `main` without review. Resolve conflicts only in your own paths; if a conflict is in a Dev1 path, take Dev1's version and tell Dev1.

## 3. Environment setup

Prerequisites: Docker (Compose v2), Python 3.11 + [uv](https://docs.astral.sh/uv/) (only for migrations/tests/demos; the service itself runs in Docker), Node.js (your projects).

```powershell
Copy-Item .env.example .env          # .env is gitignored; never commit secrets
docker compose up -d --build         # postgres, redis, neo4j, ml-service
docker compose ps
```

Compose does NOT start the gateway or frontend.

Ports (host : container), from `docker-compose.yml` / `.env.example`:

| Service | Container | Host port (env var, default) |
| --- | --- | --- |
| PostgreSQL 16 | `aedis-postgres` | `POSTGRES_PORT` = 5432 |
| Redis 7.2 | `aedis-redis` | `REDIS_PORT` = 6379 |
| Neo4j 5.18 HTTP / Bolt | `aedis-neo4j` | `NEO4J_HTTP_PORT` = 7474 / `NEO4J_BOLT_PORT` = 7687 |
| ML service | `aedis-ml-service` | `ML_SERVICE_PORT` = 8000 |

Host-port remaps: if your machine already runs Postgres on 5432 or Redis/Memurai on 6379, `localhost` hits the local server, not the container. Set in `.env` e.g. `POSTGRES_PORT=5433`, `REDIS_PORT=6380` and update the host URLs (`DATABASE_URL`, `MIGRATION_DATABASE_URL`, `REDIS_URL`) to those ports (commented examples in `.env.example`). Inside Compose the containers always use `postgres:5432` and `redis:6379`. Dev1's machine uses 5433/6380. The gateway defaults to port 3000, same as Next.js dev: separate them yourself.

Apply migrations (required; revision `002` creates the restricted `aedis_app` role and integrity constraints). Run from `services/ml-service`; `MIGRATION_DATABASE_URL` (owner role `aedis_admin`) takes precedence over `DATABASE_URL`:

```powershell
cd services\ml-service
uv sync
$env:MIGRATION_DATABASE_URL = "postgresql+psycopg://aedis_admin:aedis_password@localhost:5432/aedis_db"   # adjust port if remapped
uv run alembic upgrade head
cd ..\..
```

Neo4j constraints + deterministic seed graph (after Neo4j is healthy; reads `.env` for `NEO4J_*`):

```powershell
uv run --project services/ml-service python scripts/apply_neo4j_schema.py --seed
```

Seed: 7 events, tenant `00000000-0000-4000-8000-0000000000a1`, ring `ring-seed-001` = `mule-001..003` sharing one device and IP `203.0.113.50`. Treat that tenant as the shared seed fixture: Dev1's demo scripts use a separate tenant `00000000-0000-4000-8000-0000000000d1` and tests use throwaway tenants. Note that `POST /v1/transactions/score` writes graph/DB rows for whatever tenant you send; use your own tenant ids for experiments rather than `...0a1`.

Verify:

```powershell
curl http://localhost:8000/health        # {"status":"ok","service":"aedis-ml-service"}
curl http://localhost:8000/health/ready  # 200 {"status":"ok","postgres":true,"redis":true,"neo4j":true,"models":[...]}; 503 + "degraded" otherwise
curl http://localhost:8000/version       # {"service","version","python","models":[{"name","version","loaded","error"}]}
```

`models[]` must show `fraud` and `distress` with `loaded: true`. Model artifacts (`fraud-v1` ONNX/XGBoost, `distress-v1` LightGBM) are committed under `services/ml-service/artifacts/` and baked into the Docker image (`COPY artifacts`); nothing to download. After pulling new Dev1 commits, rebuild: `docker compose up -d --build ml-service`.

DB roles: ML service runs as `aedis_app` (DML on business tables, only SELECT/INSERT on `audit_log`). `aedis_admin` is the owner, for migrations only. Your runtime code must use `aedis_app`-style least-privilege access, never the owner role.

## 4. Service contracts (ML service, base `http://localhost:8000`)

JSON is snake_case except `POST /v1/transactions/score` and `POST /internal/graph/sync` (camelCase `TransactionEvent`; snake_case also accepted). Source of truth: `services/ml-service/app/schemas/`, `app/api/*.py`, and `/openapi.json`.

Common: send `x-request-id` (any string, max 64 chars kept); the service echoes it in the `x-request-id` response header, logs it, and puts it in error bodies. Without it, it generates one. Responses also carry `x-process-time-ms`.

Error body (all non-2xx):

```json
{"error": {"code": "NOT_FOUND", "message": "...", "request_id": "...", "details": [{"loc": ["body","amount"], "msg": "...", "type": "..."}]}}
```
`details` only appears on validation errors.

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 404 | `NOT_FOUND` (unknown route: `HTTP_ERROR`) | Unknown alert / account |
| 409 | `CONFLICT` | Illegal alert-resolution transition |
| 422 | `VALIDATION_ERROR` | Schema failure (also bad `since` in the future for metrics) |
| 503 | `MODEL_NOT_LOADED` | Model artifact missing / failed to load |
| 503 | `DEPENDENCY_UNAVAILABLE` | Postgres / Redis / Neo4j unreachable |
| 500 | `INTERNAL_ERROR` | Unexpected; no internals leaked |

| Method | Path | Request | Response (key fields) |
| --- | --- | --- | --- |
| GET | `/health` | - | `{status:"ok", service}` (no dependency checks) |
| GET | `/health/ready` | - | `{status:"ok"\|"degraded", postgres, redis, neo4j, models[]}`; 503 if degraded |
| GET | `/version` | - | `{service, version, python, models[{name,version,loaded,error}]}` |
| POST | `/v1/transactions/score` | camelCase `TransactionEvent` (below) | `TransactionScoreResponse` (below) |
| POST | `/v1/models/fraud/score` | `{transaction_id, tenant_id, features:{amount_zscore, velocity_1h, velocity_24h, graph_hops(-1..4), is_new_beneficiary, device_age_days, ip_country_risk(0..1), hour_of_day(0..23), day_of_week(0..6, Mon=0), channel_risk_score(0..1)}}` | `{transaction_id, model_version, feature_version, fraud_probability, status, graph_status, inference_latency_ms}`. You must supply the features; prefer `/v1/transactions/score`. |
| POST | `/v1/models/distress/score-batch` | `{evaluation_date:"YYYY-MM-DD", borrowers:[{borrower_id:uuid, features:{avg_balance_30d, avg_balance_60d, balance_drop_pct, atm_spike_ratio, new_credit_count:int>=0}}]}` (1..500) | `{model_version, feature_version, evaluation_date, scores:[{borrower_id, distress_score:int 0-100, risk_band}], inference_latency_ms}` |
| POST | `/v1/models/explain/shap` | discriminated by `model_name`: `"fraud"` + `entity_type:"FRAUD_EVENT"` + fraud `features`, or `"distress"` + `entity_type:"DISTRESS_SCORE"` + distress `features`; plus `entity_id` (uuid), `top_n` (1-10, default 3) | `{entity_type, entity_id, model_name, model_version, base_value, top_drivers:[{feature,value,shap_contribution}], inference_latency_ms}` |
| GET | `/v1/dashboard/metrics?tenant_id=<uuid>&since=<ISO datetime, optional>` | default window = last 24 h; naive `since` = UTC | `{tenant_id, since, until, fraud_events_total, fraud_events_by_status:{approved,flagged,blocked}, flagged_blocked_rate (null if none), resolutions:{pending,resolved}, distress_by_risk_band:{low,medium,high,critical}, inference_latency_avg_ms, inference_latency_p95_ms, graph_degraded_count, transactions_count}` |
| GET | `/v1/dashboard/graph/{account_id}?tenant_id=<uuid>&depth=1..3` (default 2) | - | Cytoscape-ready `{nodes:[{data}], edges:[{data}], meta}` (below). 404 if account not in tenant graph; 503 `DEPENDENCY_UNAVAILABLE` if Neo4j fails |
| POST | `/v1/alerts/{alert_id}/resolve` | `{tenant_id, resolution, resolved_by (1..200 chars), note? (<=2000)}`; extra fields rejected | `{alert_id, tenant_id, previous_resolution, resolution, resolved_by, resolved_at, changed}` |
| POST | `/internal/graph/sync` | camelCase `TransactionEvent` | `{transaction_id, nodes_created, relationships_created, properties_set, duration_ms, replayed}` (idempotent; internal only; `/v1/transactions/score` already syncs) |
| GET | `/v1/alerts` (list) | - | **PENDING**: no list-alerts endpoint exists. Get alert ids from `fraud_event_id` in score responses. |

`TransactionEvent` (camelCase):

```json
{"tenantId":"<uuid>","transactionId":"<uuid>","fromAccountId":"victim-001","toAccountId":"mule-001","amount":4750.0,"currency":"USD","channel":"web","deviceId":"device-ring-001","ipAddress":"203.0.113.50","timestamp":"2026-02-01T03:10:00Z"}
```
Required: tenantId, transactionId, fromAccountId, toAccountId, amount (>0), channel (`mobile|web|atm|branch`), timestamp. Optional: currency (3 chars, default `USD`), deviceId, ipAddress (valid IP). Naive timestamps are UTC.

`TransactionScoreResponse`:

```json
{"fraud_event_id":"<uuid>","score":{"transaction_id":"...","model_version":"fraud-v1","feature_version":"fraud-features-v1","fraud_probability":0.0,"status":"APPROVED|FLAGGED|BLOCKED","graph_status":"OK|DEGRADED","inference_latency_ms":0.0},"fraud_ring_ids":[],"suspicious_accounts":[],"top_drivers":[{"feature":"...","value":0.0,"shap_contribution":0.0}],"graph_synced":true,"total_latency_ms":0.0}
```

Graph response: node `data` = `{id ("account:<id>"|"device:<id>"|"ip:<ip>"), label, type (Account|Device|IPAddress), distance}`; Account nodes also have `fraudRingId`, `flagged`, `isCenter`. Edge `data` = `{id, source, target, type (TRANSACTED_WITH|SHARES_DEVICE|SHARES_IP)}`; `TRANSACTED_WITH` also has `transactionId, amount, currency, occurredAt`. `meta` = `{tenant_id, account_id, depth, node_cap(200), node_count, edge_count, flagged_accounts, truncated}`. Edge cap 1000; `meta.truncated` tells you if capped.

Alert state machine (`resolution`, stored in `fraud_events.resolution`; alert id = `fraud_event_id`). New events start `PENDING`. Values: `PENDING, STEP_UP_SENT, STEP_UP_PASSED, STEP_UP_FAILED, OVERRIDE_APPROVE, CONFIRM_BLOCK, ESCALATE`.

| From | Allowed targets |
| --- | --- |
| PENDING | STEP_UP_SENT, OVERRIDE_APPROVE, CONFIRM_BLOCK, ESCALATE |
| STEP_UP_SENT | STEP_UP_PASSED, STEP_UP_FAILED, ESCALATE |
| STEP_UP_PASSED | OVERRIDE_APPROVE |
| STEP_UP_FAILED | CONFIRM_BLOCK, ESCALATE |
| ESCALATE | OVERRIDE_APPROVE, CONFIRM_BLOCK |
| OVERRIDE_APPROVE, CONFIRM_BLOCK | none (terminal) |

Resolving to the current state is a no-op: 200 with `changed:false` (idempotent). Unknown alert or wrong tenant: 404. Illegal transition: 409. `resolved_by`/`resolved_at` are set only on terminal states. Each change appends an `audit_log` row (`RESOLVED`).

## 5. Integration flow to implement

1. Gateway (already sketched) does `XADD stream:transaction:raw` with fields `tenantId`, `transactionId`, `payload` (JSON string), `receivedAt`. (Other docs name the stream differently; `services/api-gateway/src/config.ts` says `stream:transaction:raw` - use that.)
2. Your worker consumes the stream (consumer group, ack after success). Build the body by parsing `payload` JSON (camelCase) and setting `tenantId` from the stream field (same as `TransactionEvent.from_stream_fields`). `POST /v1/transactions/score` with an `x-request-id`.
   - The service reads history from Postgres + a bounded Neo4j lookup, scores, persists `transactions`/`fraud_events`/`audit_log`, then syncs the graph. Re-sending the same `transactionId` re-scores in place (safe to retry; no duplicate rows).
   - On 503, retry with backoff; on 422, dead-letter (bad payload).
3. Act on `score.status`: `APPROVED` (< 0.3), `FLAGGED` (0.3 to 0.7), `BLOCKED` (> 0.7). Never recompute the thresholds yourself.
4. `score.graph_status == "DEGRADED"` means the graph lookup failed/timed out (`graph_hops = -1`): the score is less reliable. Surface it in the UI and consider manual review for borderline cases. `graph_synced:false` means the score is saved but the graph write failed.
5. `top_drivers` are numeric SHAP values (signed log-odds; positive raises risk), only for FLAGGED/BLOCKED, empty for APPROVED. Turning them into text (LLM/narrative) is your job; the ML service never calls an LLM.
6. Your policy engine / intervention webhooks decide actions (step-up, hold, etc.) using status, `fraud_ring_ids`, `suspicious_accounts`, drivers. Record transitions via the resolve API.
7. Analyst action: `POST /v1/alerts/{fraud_event_id}/resolve` with `tenant_id`, `resolution`, `resolved_by`. Handle 404/409 in the UI; treat `changed:false` as success.
8. Dashboard reads (via your gateway, which enforces auth + tenant): `GET /v1/dashboard/metrics` and `GET /v1/dashboard/graph/{account_id}` (feed `nodes`/`edges` straight into Cytoscape `elements`). Push live updates with Socket.io/SSE from your worker after scoring.

Distress batch flow:
- Redis hash `borrower:{borrower_id}:features` with fields `avg_balance_30d, avg_balance_60d, balance_drop_pct, atm_spike_ratio, new_credit_count, computed_at` (ISO-8601 UTC), TTL **90000 s** (25 h) so a nightly job refreshes it. Reference implementation: `services/ml-service/app/featurestore/borrower.py` (read only).
- Your nightly worker reads the hashes, batches up to 500 borrowers, and calls `POST /v1/models/distress/score-batch`. Missing/expired hashes mean skip the borrower. Bands: 0-39 LOW, 40-59 MEDIUM, 60-74 HIGH, 75-100 CRITICAL.
- **PENDING:** the ML service does not persist scores from `score-batch` itself (only the demo script writes `loan_distress_scores`); no HTTP endpoint for that exists. Ask Dev1 (section 10).

## 6. Multi-tenancy, DB, secrets

- Every request carries a `tenant_id`/`tenantId` (UUID). Derive it from the verified JWT in your gateway, never from client input. All reads/writes are tenant-scoped; cross-tenant ids return 404.
- Graph: `Account` nodes are tenant-scoped; `Device` and `IPAddress` nodes are global/shared infrastructure.
- Use restricted DB roles at runtime (`aedis_app`); `audit_log` is append-only (UPDATE/DELETE/TRUNCATE rejected). Do not use `aedis_admin` outside migrations.
- Never commit `.env`, keys or real credentials; `.env.example` holds local placeholders only.

## 7. Testing the integration

```powershell
cd services\ml-service
uv run pytest -q                        # full suite; integration tests skip if Postgres is unreachable (AEDIS_REQUIRE_INTEGRATION=1 makes that a failure). Integration tests need DATABASE_URL (aedis_app) and MIGRATION_DATABASE_URL (aedis_admin) pointing at the stack, e.g. the ports from your .env
uv run pytest -q tests/test_demo_scenarios.py   # no services needed
uv run python scripts/demo_scam_ring.py           # optional arg: base URL, else AEDIS_ML_URL, else http://localhost:8000
uv run python scripts/demo_loan_distress.py
```

Demo scripts live in `services/ml-service/scripts/` (not the root `scripts/`). They read repo-root `.env` and require the stack, migrations and a current image.

- `demo_scam_ring.py` prints, per probe (9 total: control + two ring transfers for each of victim-001..003): `status=... fraud_probability=... graph_status=... graph_hops=...`, `fraud_ring_ids`, `suspicious_accounts`, `graph_synced`, `top_drivers` (empty if APPROVED, else `driver <feature>=<value> shap=<x>` lines), `model=... service_latency_ms=...`. Values are produced by the service; do not hardcode them. Re-runnable.
- `demo_loan_distress.py` prints "wrote 8 borrower feature hashes to Redis", model/feature version, a table `borrower profile drop% atm_spike new_credit score band`, and how many `loan_distress_scores` rows were persisted.
- Exit codes: 2 service unreachable, 3 non-200 from scoring (e.g. 404 stale image, 503 `MODEL_NOT_LOADED`), 4 Postgres/Redis/Neo4j unavailable.

Smoke checklist:
- [ ] `docker compose ps` shows 4 healthy containers
- [ ] `alembic upgrade head` succeeded; Neo4j schema + seed applied
- [ ] `/health` 200, `/health/ready` 200 with both models `loaded:true`, `/version` OK
- [ ] `POST /v1/transactions/score` with a valid body returns 200 and a `fraud_event_id`; same body twice causes no duplicate rows
- [ ] Invalid body gives 422 with the error shape; unknown alert gives 404
- [ ] Resolve: `PENDING -> ESCALATE` (changed:true), repeat (changed:false), `ESCALATE -> PENDING` gives 409
- [ ] `/v1/dashboard/metrics?tenant_id=...` and `/v1/dashboard/graph/mule-001?tenant_id=00000000-0000-4000-8000-0000000000a1` return data
- [ ] `x-request-id` you send comes back in the response header

## 8. Known limitations (be honest in the UI and demo)

- Models are trained on **synthetic data only**. Scores and probabilities say nothing about real-bank performance. See `docs/dev1/model-card-fraud.md`.
- No latency/benchmark claims: the benchmark has not been measured yet. `inference_latency_ms` is model-run time only; `total_latency_ms` is one service call. Do not quote an SLO.
- Graph enrichment is bounded to 3 hops with a short timeout (`graph_query_timeout_seconds` = 0.5 s); on failure scoring falls back to `graph_status: DEGRADED`. The dashboard graph view is capped (depth <= 3, 200 nodes, 1000 edges).
- No authentication in the ML service; no list-alerts endpoint (**PENDING**); no persisted-distress HTTP endpoint (**PENDING**).

## 9. Troubleshooting

- **Port conflict / connects to the wrong DB or Redis:** a local Postgres on 5432 or Redis/Memurai on 6379 shadows the container. Remap `POSTGRES_PORT`/`REDIS_PORT` in `.env`, update host URLs, `docker compose up -d`.
- **404 on `/v1/transactions/score` or missing routes / old behaviour:** stale image. `docker compose up -d --build ml-service`.
- **503 `MODEL_NOT_LOADED`:** check `/version` and `/health/ready` `models[].error`; rebuild the image so `artifacts/` is included.
- **`/health/ready` 503 degraded:** read which of `postgres`/`redis`/`neo4j` is false; Neo4j needs ~40 s on first start; check `docker compose logs <service>`.
- **`graph_status: DEGRADED`:** Neo4j slow/unreachable or schema not applied; run `scripts/apply_neo4j_schema.py --seed` and check Neo4j health. Scores still persist.
- **Permission errors on `audit_log` or DB auth failures:** migrations not applied (`aedis_app` role missing) or you used the wrong role/password (`AEDIS_APP_PASSWORD`).
- **422 on score:** check camelCase body, `channel` enum, valid `ipAddress`, `amount > 0`; read `error.details`.

## 10. Rules for the agent

1. Edit only `frontend/` and `services/api-gateway/` (and your own new Dev2 paths/docs). Never edit `services/ml-service`, `infra/`, `scripts/`, `docker-compose.yml`.
2. Verify against code or `/openapi.json` before relying on any field; do not invent endpoints or fields.
3. Propagate `x-request-id` on every call to the ML service and log it.
4. Always send tenant ids derived from authenticated identity.
5. Use the returned `status`; do not recompute thresholds or scores in Dev2 code.
6. Do not claim performance or accuracy; models are synthetic-data-trained.
7. No schema changes, no secrets in git, no force-push, no merge to `main` without review.
8. Make worker handlers idempotent (score and resolve are both safe to retry).

Questions to ask Dev1:
1. (Resolved) `dev1/foundation-setup` is on `origin` and M1-M16 is merged to `main`.
2. Will there be an endpoint to list/page alerts (by tenant, status, resolution)? Currently only per-id resolve exists.
3. Who persists `loan_distress_scores` for the nightly batch: an HTTP endpoint from Dev1, or can Dev2 write via a defined path?
4. Which Postgres role/credentials should the gateway/workers use for reads (e.g. dashboards, alert lists), and any schema changes you need (migration request)?
5. Is `/internal/graph/sync` meant to be called by Dev2, or only by the scoring pipeline?
6. Expected stream consumer group name and retry/dead-letter convention for `stream:transaction:raw`.
7. When will benchmark/latency numbers be available, and is a different set of tenants/seed data planned beyond tenant `...0a1` (and the demo tenant `...0d1`)?
