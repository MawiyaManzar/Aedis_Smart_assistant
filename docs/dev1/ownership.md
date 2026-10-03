# Developer ownership

This file records the hackathon split. Developer 1 setup does not implement Developer 2's services.

## Developer 1 owns

- Docker Compose for PostgreSQL, Redis, Neo4j, and the Python ML service
- PostgreSQL schema and Alembic migrations
- Redis connectivity used by Developer 1 services (feature-store client wiring, not the stream consumers)
- Neo4j constraints, indexes, and graph synchronization (implemented: `POST /internal/graph/sync`, and `POST /v1/transactions/score` syncs after scoring; no stream consumer, that is Developer 2's worker)
- `services/ml-service` FastAPI process
- XGBoost fraud inference, ONNX Runtime, LightGBM loan-distress inference, SHAP endpoint
- Synthetic demo data and demo scripts (`services/ml-service/scripts/`), dashboard graph/metrics APIs, and the analyst resolution API (all implemented)
- Latency benchmark: not measured yet; no latency targets are claimed

## Developer 2 owns

Do not modify these areas as part of Developer 1 work:

- `frontend/` Next.js dashboard, including Cytoscape.js views
- `services/api-gateway/` Fastify gateway, JWT, and Redis stream publish helper
- Redis Stream consumers and BullMQ workers
- LLM / OpenRouter explanation worker
- LangGraph / LangChain orchestration
- Policy / rules engine and intervention webhooks
- Socket.io / SSE dashboard gateway

`skills-lock.json`, `aedis_backend_architecture.md`, and `hackathon_execution_plan.md` are shared documents and were left unchanged.

## Interfaces between the two developers

Implemented now:

| Caller | Contract | Owner of the caller |
| --- | --- | --- |
| API gateway | `POST /v1/transactions` body in `services/api-gateway/src/schemas/transaction.ts` (camelCase) | Developer 2, already sketched |
| API gateway | `XADD stream:transaction:raw` via `services/api-gateway/src/redis.ts` | Developer 2, already sketched |
| Fraud worker | `POST /v1/models/fraud/score` on port 8000, snake_case JSON | Developer 2 calls, Developer 1 serves |
| Distress batch worker | `POST /v1/models/distress/score-batch` | Developer 2 calls, Developer 1 serves |
| Explainability worker | `POST /v1/models/explain/shap` for numeric drivers only | Developer 2 calls, Developer 1 serves. Developer 2 writes the LLM sentence |

The ML service does not call an LLM and does not depend on LangChain or LangGraph.

Request and response fields for the three model routes are in `docs/dev1/api-contracts.md`. Those routes are live and serve real inference from the committed `fraud-v1` / `distress-v1` artifacts (trained on synthetic data only).

Also live (see `docs/dev1/dev2-integration.md` for contracts):

- `POST /v1/transactions/score` (end-to-end: features, score, persist, graph sync)
- `POST /internal/graph/sync`
- `GET /v1/dashboard/graph/{account_id}`
- `GET /v1/dashboard/metrics`
- `POST /v1/alerts/{id}/resolve`

Not implemented: a stream consumer for `stream:transaction:raw` (Developer 2's worker calls `POST /v1/transactions/score`), a list-alerts endpoint, and an HTTP endpoint that persists distress batch scores. Developer 1 does not build the UI.

## Contract mismatches already in the repo

Follow the existing gateway code where it disagrees with older wording:

- Stream name in code is `stream:transaction:raw`. The architecture doc also says `transaction.raw`. The frontend README says `stream:transactions:incoming`. Developer 1's next consumer should use `stream:transaction:raw`.
- ML routes in the execution plan are `/v1/models/...`. The frontend README lists `/api/v1/...` paths that are not implemented.
- Tables created here are `transactions`, `fraud_events`, `loan_distress_scores`, and `audit_log`. The frontend README mentions `borrower_distress` and `immutable_audit_log`, which do not exist.
- `borrowers` exists because the architecture's `loan_distress_scores.borrower_id` foreign key requires it.
- Port 8000 is the ML service, matching the execution plan. The frontend README also mentions `ws://localhost:8000/ws/v1/alerts`. That websocket is Developer 2's dashboard gateway and needs a different port.
- The API gateway defaults to port 3000, which is also the Next.js dev port. Developer 2 needs to separate those. Developer 1 did not change either service.

## Data stores

| Store | What Developer 1 provides now | What Developer 2 should assume |
| --- | --- | --- |
| PostgreSQL `aedis_db` | Tables, foreign keys, indexes, append-only `audit_log` trigger, insert-only RLS policy for role `audit_writer` | Read and write through these tables. Do not add a second schema for the same entities. |
| Redis | Server on 6379 with AOF | Streams, BullMQ, and feature hashes. Feature hash shape remains `borrower:{id}:features` from the architecture doc. |
| Neo4j | Uniqueness constraints for `Account(id, tenantId)`, `Device(id)`, `IPAddress(ip)` | Graph queries use `TRANSACTED_WITH`, `SHARES_DEVICE`, and `SHARES_IP`. |

`audit_log` rejects `UPDATE` and `DELETE` with a trigger, including for the table owner. Row Level Security is enabled but not forced, so the local `aedis_admin` owner can insert and select. A non-owner writer must `SET ROLE audit_writer` to pass the insert policy.
