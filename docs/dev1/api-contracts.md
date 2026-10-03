# Developer 1 model API contracts

**READY FOR IMPLEMENTATION**

These routes exist and validate payloads. They do not score. Every success response sets `inference_mode` to `stub`, `model_version` to `unset`, and score fields to `null`. An empty `top_drivers` array means the explainer did not run.

Base URL in local Compose: `http://localhost:8000`

JSON fields are snake_case. The API gateway transaction body is camelCase. The worker that calls these routes is responsible for mapping between them.

## Shared fields

| Field | Meaning |
| --- | --- |
| `model_version` | Identifier of the loaded artifact. `unset` means no weights are loaded. |
| `inference_mode` | `stub` during this phase. A later phase may add `onnx`, `lightgbm`, or `shap`. Clients must not treat `stub` as a risk decision. |
| `latency_ms` | Wall time spent inside the handler for this request. It is not a model benchmark and not an end-to-end fraud SLO. |
| `detail` | Human-readable reason the body is a stub. |

## Errors

| Status | When |
| --- | --- |
| 200 | Payload matches the schema. Body is still a stub until weights exist. |
| 422 | Body failed schema validation. FastAPI returns `{"detail": [{"type", "loc", "msg", "input"}]}`. |
| 500 | Unexpected server error. |
| 503 | `GET /health/ready` only, when Postgres, Redis, or Neo4j is unreachable. |

No authentication is enforced on the ML service. The gateway in front of it is Developer 2's responsibility.

## GET /health

Process liveness. Does not check databases.

```json
{"status": "ok", "service": "aedis-ml-service"}
```

## GET /version

```json
{
  "service": "aedis-ml-service",
  "version": "0.1.0",
  "python": "3.11.x",
  "inference_mode": "stub"
}
```

## GET /health/ready

```json
{"status": "ok", "postgres": true, "redis": true, "neo4j": true}
```

`status` is `degraded` and the HTTP status is 503 when any boolean is false.

## POST /v1/models/fraud/score

Scores one transaction feature vector. The caller hydrates features. This service does not read Redis or Neo4j on this route yet.

### Request

| Field | Type | Meaning |
| --- | --- | --- |
| `transaction_id` | UUID | Same id the gateway accepted |
| `tenant_id` | UUID | Tenant from the gateway stream entry |
| `features.amount_zscore` | number | Amount relative to the account's baseline |
| `features.velocity_1h` | number | Transaction count or amount velocity over 1 hour |
| `features.velocity_24h` | number | Same window over 24 hours |
| `features.graph_hops` | integer >= 0 | Neo4j hop count supplied by the worker |
| `features.is_new_beneficiary` | boolean | Beneficiary not seen before for this sender |
| `features.device_age_days` | number >= 0 | Age of the device identifier |
| `features.ip_country_risk` | number | Caller-supplied country risk figure |
| `features.hour_of_day` | integer 0-23 | Hour from the transaction timestamp |
| `features.day_of_week` | integer 0-6 | Monday = 0 |
| `features.channel_risk_score` | number | Caller-supplied channel risk figure |

```json
{
  "transaction_id": "8b0b0d0e-6c1a-4f0a-9c2d-1a2b3c4d5e6f",
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "features": {
    "amount_zscore": 1.5,
    "velocity_1h": 2.0,
    "velocity_24h": 4.0,
    "graph_hops": 1,
    "is_new_beneficiary": true,
    "device_age_days": 3.0,
    "ip_country_risk": 0.2,
    "hour_of_day": 3,
    "day_of_week": 1,
    "channel_risk_score": 0.4
  }
}
```

### Response

| Field | Type | Meaning |
| --- | --- | --- |
| `fraud_probability` | number or null | Intended range is 0 to 1 once ONNX scoring exists. Null now. |
| `status` | `APPROVED`, `FLAGGED`, `BLOCKED`, or null | Threshold decision. Null now. The architecture thresholds are < 0.3 approved, 0.3-0.7 flagged, > 0.7 blocked. This service does not apply them yet. |

```json
{
  "transaction_id": "8b0b0d0e-6c1a-4f0a-9c2d-1a2b3c4d5e6f",
  "model_version": "unset",
  "inference_mode": "stub",
  "fraud_probability": null,
  "status": null,
  "latency_ms": 0.1,
  "detail": "ONNX fraud weights are not loaded. This is a contract stub, not a model score."
}
```

## POST /v1/models/distress/score-batch

Batch size is 1 to 500 borrowers, matching the architecture's page size.

### Request

| Field | Type | Meaning |
| --- | --- | --- |
| `evaluation_date` | `YYYY-MM-DD` | Batch evaluation date |
| `borrowers[].borrower_id` | UUID | Borrower primary key |
| `borrowers[].features.avg_balance_30d` | number | 30-day average closing balance |
| `borrowers[].features.avg_balance_60d` | number | 60-day average closing balance |
| `borrowers[].features.balance_drop_pct` | number | Derived as `(avg_balance_60d - avg_balance_30d) / avg_balance_60d` by a future builder |
| `borrowers[].features.atm_spike_ratio` | number | Derived as `atm_14d / (atm_28d / 2)` by a future builder |
| `borrowers[].features.new_credit_count` | integer >= 0 | Count of high-interest credit events. The architecture SQL names the source column `new_high_interest_count`. |

`DistressFeatureBuilder.build` accepts the SQL aggregate inputs (`avg_balance_30d`, `avg_balance_60d`, `atm_14d`, `atm_28d`, `new_high_interest_count`) and raises `NotImplementedError`. It does not derive the ratios yet.

### Response

| Field | Type | Meaning |
| --- | --- | --- |
| `scores[].distress_score` | integer 0-100 or null | Null now |
| `scores[].risk_band` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, or null | Architecture bands are 0-39, 40-59, 60-74, 75-100. Not applied yet. |

```json
{
  "model_version": "unset",
  "inference_mode": "stub",
  "evaluation_date": "2026-10-03",
  "scores": [
    {
      "borrower_id": "22222222-2222-2222-2222-222222222222",
      "distress_score": null,
      "risk_band": null
    }
  ],
  "latency_ms": 0.1,
  "detail": "LightGBM distress weights are not loaded. This is a contract stub, not a model score."
}
```

## POST /v1/models/explain/shap

One route, two body shapes, selected by `model_name`.

Fraud body: `model_name = "fraud"`, `entity_type = "FRAUD_EVENT"`, `features` is a fraud feature object.

Distress body: `model_name = "distress"`, `entity_type = "DISTRESS_SCORE"`, `features` is a distress feature object.

| Field | Type | Meaning |
| --- | --- | --- |
| `entity_id` | UUID | `fraud_events.id` or `loan_distress_scores.id` |
| `top_n` | integer 1-10, default 3 | How many drivers a future explainer should return |

### Response

| Field | Type | Meaning |
| --- | --- | --- |
| `top_drivers` | array | Empty while the explainer is unloaded |
| `top_drivers[].feature` | string | Feature name |
| `top_drivers[].value` | number, boolean, or null | Feature value used for that explanation |
| `top_drivers[].shap_contribution` | number or null | Signed SHAP contribution |

```json
{
  "entity_type": "FRAUD_EVENT",
  "entity_id": "8b0b0d0e-6c1a-4f0a-9c2d-1a2b3c4d5e6f",
  "model_name": "fraud",
  "model_version": "unset",
  "inference_mode": "stub",
  "top_drivers": [],
  "latency_ms": 0.1,
  "detail": "SHAP explainer is not loaded. This is a contract stub, not an explanation."
}
```

The LLM audit sentence is not part of this response. Developer 2's explainability worker adds that after reading `top_drivers`.

## Feature builders

`FraudFeatureBuilder` and `DistressFeatureBuilder` are the only supported places to compute features. Both raise `NotImplementedError`. Calling them must not be wired to these HTTP routes until the next phase.

## PostgreSQL tables these scores will write later

The writers are not in this service yet. The columns they need already exist:

- `fraud_events.fraud_score`, `status`, `model_version`, `graph_hops`, `shap_values`, `audit_summary`
- `loan_distress_scores.distress_score`, `risk_band`, `model_version`, `features_snap`, `shap_values`, `audit_summary`
- `audit_log` append-only rows with `entity_type`, `entity_id`, `event_type`, `actor`, `payload`
