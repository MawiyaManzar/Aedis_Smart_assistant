# Developer 1 model API contracts

Status: the scoring routes below are **implemented** and return real model output. Section "Being added" lists routes other workers are building; their shapes are intent, not yet a guarantee.

Base URL in local Compose: `http://localhost:8000`. Public routes are under `/v1`; service-to-service routes are under `/internal`. Request/response models live in `services/ml-service/app/schemas/` and are the source of truth. Models are trained on **synthetic data**; probabilities and scores are not evidence of real-bank performance.

Naming: model routes use snake_case JSON. `POST /v1/transactions/score` and `POST /internal/graph/sync` take the gateway's camelCase `TransactionEvent` (snake_case names are also accepted).

No authentication is enforced by the ML service. The gateway in front of it is Developer 2's responsibility.

## Errors

Every non-2xx response has this body:

```json
{"error": {"code": "NOT_FOUND", "message": "...", "request_id": "5b1f...", "details": [{"loc": ["body", "amount"], "msg": "...", "type": "..."}]}}
```

`details` is present only when non-empty (validation errors). `request_id` is also assigned per request by the request-context middleware.

| HTTP | `code` | When |
| --- | --- | --- |
| 422 | `VALIDATION_ERROR` | Body failed schema validation; `details` holds `loc`, `msg`, `type` |
| 404 | `NOT_FOUND` / `HTTP_ERROR` | Unknown entity / unknown route |
| 409 | `CONFLICT` | State conflict |
| 503 | `MODEL_NOT_LOADED` | A model artifact is missing or failed to load |
| 503 | `DEPENDENCY_UNAVAILABLE` | Postgres, Redis or Neo4j unreachable |
| 500 | `INTERNAL_ERROR` | Unexpected error (no internals leaked) |

## Health

- `GET /health` -> `{"status": "ok", "service": "aedis-ml-service"}` (liveness, no dependency checks).
- `GET /version` -> `{"service", "version", "python", "models": [{"name","version","loaded","error"}]}`.
- `GET /health/ready` -> `{"status": "ok"|"degraded", "postgres": bool, "redis": bool, "neo4j": bool, "models": [{"name","version","loaded","error"}]}`. HTTP 503 with `status: "degraded"` when any dependency is down or any model is not loaded.

## POST /v1/models/fraud/score

The caller supplies the hydrated feature vector (this route does not read Redis/Neo4j).

Request:

| Field | Type | Meaning |
| --- | --- | --- |
| `transaction_id`, `tenant_id` | UUID | Ids from the gateway |
| `features.amount_zscore` | number | Amount relative to the sender's baseline |
| `features.velocity_1h`, `velocity_24h` | number >= 0 | Outgoing velocity in each window |
| `features.graph_hops` | integer -1..4 | 0 sender is flagged, 1-3 shortest path to a flagged account, 4 none within 3 hops, -1 graph unavailable |
| `features.is_new_beneficiary` | boolean | |
| `features.device_age_days` | number >= 0 | |
| `features.ip_country_risk` | number 0..1 | |
| `features.hour_of_day` | integer 0..23 | |
| `features.day_of_week` | integer 0..6 | Monday = 0 |
| `features.channel_risk_score` | number 0..1 | |

Response:

```json
{
  "transaction_id": "8b0b0d0e-6c1a-4f0a-9c2d-1a2b3c4d5e6f",
  "model_version": "fraud-v1",
  "feature_version": "fraud-features-v1",
  "fraud_probability": 0.0,
  "status": "APPROVED",
  "graph_status": "OK",
  "inference_latency_ms": 0.0
}
```

The numbers above are placeholders for the shape. `status`: `APPROVED` below 0.3, `FLAGGED` 0.3-0.7, `BLOCKED` above 0.7. `graph_status` is `DEGRADED` when `graph_hops` was `-1`. `inference_latency_ms` is the measured ONNX Runtime `session.run` time, not an end-to-end SLO.

## POST /v1/transactions/score

End-to-end: reads history from Postgres and a bounded Neo4j lookup, builds features (before the transaction is written, so it never influences its own score), scores, persists `transactions` / `fraud_events` / `audit_log`, then syncs the graph.

Request (camelCase):

```json
{
  "tenantId": "00000000-0000-4000-8000-0000000000a1",
  "transactionId": "<uuid>",
  "fromAccountId": "victim-001",
  "toAccountId": "mule-001",
  "amount": 4750.0,
  "currency": "USD",
  "channel": "web",
  "deviceId": "device-ring-001",
  "ipAddress": "203.0.113.50",
  "timestamp": "2026-02-01T03:10:00Z"
}
```

`channel` is one of `mobile`, `web`, `atm`, `branch` (database constraint). `deviceId` and `ipAddress` are optional; `currency` defaults to `USD`. Naive timestamps are treated as UTC.

Response:

```json
{
  "fraud_event_id": "<uuid>",
  "score": { "transaction_id": "...", "model_version": "...", "feature_version": "...", "fraud_probability": 0.0, "status": "BLOCKED", "graph_status": "OK", "inference_latency_ms": 0.0 },
  "fraud_ring_ids": ["ring-seed-001"],
  "suspicious_accounts": ["mule-001"],
  "top_drivers": [{"feature": "ip_country_risk", "value": 0.9, "shap_contribution": 0.0}],
  "graph_synced": true,
  "total_latency_ms": 0.0
}
```

`top_drivers` is computed only for `FLAGGED`/`BLOCKED` and is empty for `APPROVED`. If the graph write fails after scoring, `graph_synced` is `false` and the score is still persisted. Re-sending the same `transactionId` re-scores it in place (one `fraud_events` row per transaction and model version).

## POST /v1/models/distress/score-batch

1 to 500 borrowers per call. Needs the `distress` model loaded, otherwise 503 `MODEL_NOT_LOADED`.

Request: `{"evaluation_date": "YYYY-MM-DD", "borrowers": [{"borrower_id": "<uuid>", "features": {"avg_balance_30d", "avg_balance_60d", "balance_drop_pct", "atm_spike_ratio", "new_credit_count"}}]}`. Feature definitions: `distress-features.md`.

Response:

```json
{
  "model_version": "distress-v1",
  "feature_version": "distress-features-v1",
  "evaluation_date": "2026-02-01",
  "scores": [{"borrower_id": "<uuid>", "distress_score": 0, "risk_band": "LOW"}],
  "inference_latency_ms": 0.0
}
```

`distress_score` is an integer 0-100. Bands: 0-39 `LOW`, 40-59 `MEDIUM`, 60-74 `HIGH`, 75-100 `CRITICAL`. `inference_latency_ms` is the measured LightGBM predict time.

## POST /v1/models/explain/shap

One route, two body shapes selected by `model_name`. Fraud: `model_name: "fraud"`, `entity_type: "FRAUD_EVENT"`, `features` = fraud features. Distress: `model_name: "distress"`, `entity_type: "DISTRESS_SCORE"`, `features` = distress features. Common fields: `entity_id` (UUID), `top_n` (1-10, default 3).

Response:

```json
{
  "entity_type": "FRAUD_EVENT",
  "entity_id": "<uuid>",
  "model_name": "fraud",
  "model_version": "fraud-v1",
  "base_value": 0.0,
  "top_drivers": [{"feature": "amount_zscore", "value": 1.5, "shap_contribution": 0.0}],
  "inference_latency_ms": 0.0
}
```

`shap_contribution` is a signed log-odds contribution (positive raises risk); `base_value` is the expected model output over the background set. The natural-language audit sentence is not part of this response; Developer 2's explainability worker produces it from `top_drivers`.

## POST /internal/graph/sync

Idempotently writes one transaction (same camelCase body as `/v1/transactions/score`) into Neo4j. Not part of the public dashboard API.

```json
{"transaction_id": "<uuid>", "nodes_created": 0, "relationships_created": 0, "properties_set": 0, "duration_ms": 0.0, "replayed": true}
```

`replayed` is `true` when the event changed no graph structure (all counts zero on an exact replay). Flagged ring accounts are `Account` nodes with `fraudRingId` set.

## Being added (not final)

These routes are being implemented by other workers on this branch. Treat the paths as agreed and the bodies as provisional until the code lands; `app/api/*.py` and the OpenAPI document at `/openapi.json` are authoritative.

- `GET /v1/dashboard/graph/{account_id}` - neighbourhood of an account for the dashboard graph view (nodes and edges, with flagged accounts and their `fraudRingId`).
- `GET /v1/dashboard/metrics` - aggregate counts and rates computed from persisted `fraud_events` / `loan_distress_scores`.
- `POST /v1/alerts/{id}/resolve` - resolve a fraud alert; errors use the shared error body above (404 `NOT_FOUND` for an unknown id).

## Persistence

Scores are written by `app/db/repositories.py`: `fraud_events` (`fraud_score`, `status`, `graph_hops`, `graph_status`, `fraud_ring_ids`, `model_version`, `features_snap`, `shap_values`), `loan_distress_scores` (`distress_score`, `risk_band`, `model_version`, `features_snap`, `shap_values`) and append-only `audit_log`.
