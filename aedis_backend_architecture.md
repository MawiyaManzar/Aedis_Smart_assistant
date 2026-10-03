# Aedis Smart Assistant — Backend Architecture

> **Matt Pocock flow position:** This document is the output of the `/wayfinder` → `/to-spec` phase.
> It captures every architectural decision, its rationale, and its blocking edges so that
> `/to-tickets` can immediately split this into tracer-bullet implementation tickets.

---

## 0. Domain Glossary (live reference for `/domain-modeling`)

| Term | Definition |
|------|------------|
| **Transaction Event** | A single financial action (transfer, withdrawal, payment) emitted by a core banking system |
| **Fraud Ring** | A graph subgraph of accounts sharing devices, IPs, or beneficiary chains flagged as malicious |
| **Distress Score** | A 0–100 numeric signal indicating loan default probability, recomputed daily |
| **SHAP Drivers** | The top-N input features that moved a model's output, expressed as signed numeric contributions |
| **Intervention** | A system action (OTP challenge, freeze, CRM outreach) triggered by a score crossing a threshold |
| **Audit Trail** | Immutable, append-only log of every model output + its natural-language explanation |
| **Feature Store** | A Redis-backed cache of pre-aggregated financial features consumed by ML models |
| **Policy Engine** | A rules service that maps score ranges → intervention actions |
| **Resolution** | A user or analyst action that closes an open alert (e.g., "OTP verified", "override") |

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                         External World                          │
│                                                                 │
│  Core Banking System ──►  Aedis Backend  ◄── Risk Analysts     │
│  Mobile App          ──►              ◄── Credit Officers      │
│  SMS / WhatsApp GW   ◄──              ──► Payment Processor    │
│  Loan CRM            ◄──              ──► Neo4j Cloud (graph)  │
└─────────────────────────────────────────────────────────────────┘
```

**Trust boundary:** All inbound traffic enters through a single API Gateway. All outbound webhooks are signed with HMAC-SHA256.

---

## 2. Container Map (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Public Edge                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  API Gateway  (Kong / AWS API GW)                                │   │
│  │  • Auth: JWT RS256 + API-key for service-to-service              │   │
│  │  • Rate limiting, request tracing (OpenTelemetry)                │   │
│  └──────┬─────────────────────────────────────┬────────────────────┘   │
│         │ REST/gRPC                            │ WebSocket / SSE        │
│  ┌──────▼────────────┐              ┌──────────▼──────────────────┐     │
│  │  Transaction      │              │  Dashboard Gateway           │     │
│  │  Ingestion API    │              │  (Socket.io / SSE hub)       │     │
│  └──────┬────────────┘              └──────────┬────────────────── ┘    │
│         │ publish                              │ push alerts             │
│  ┌──────▼────────────────────────────────────────────────────────────┐  │
│  │  Event Bus: Redis Streams (hot path) + Kafka (durable, replay)    │  │
│  │  Topics: transaction.raw  |  alert.created  |  resolution.logged  │  │
│  └──┬──────────────┬─────────────────────┬────────────────┬──────────┘  │
│     │              │                     │                │             │
│  ┌──▼──────┐  ┌───▼──────────┐  ┌───────▼──────┐  ┌─────▼──────────┐  │
│  │ Fraud   │  │ Loan Distress│  │ Explainability│  │ Policy/Rules  │  │
│  │ Scoring │  │ Batch Worker │  │ Worker        │  │ Engine        │  │
│  │ Service │  │ (BullMQ)     │  │ (LLM + SHAP)  │  │               │  │
│  └──┬──────┘  └───┬──────────┘  └───────┬──────┘  └─────┬──────────┘  │
│     │              │                     │                │             │
│  ┌──▼──────────────▼─────────────────────▼────────────────▼──────────┐  │
│  │  Shared Data Layer                                                 │  │
│  │  PostgreSQL (source of truth)  │  Redis (Feature Store + cache)   │  │
│  │  Neo4j (graph relationships)   │  S3/Blob (model artefacts)       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Feature 1 — Real-Time Scam & Mule Detection

### 3.1 Flow (under 50 ms SLO)

```
Mobile/Core Banking
      │  POST /v1/transactions
      ▼
API Gateway (< 2 ms)
      │  validates JWT, schema
      ▼
Transaction Ingestion API  ──►  Redis Stream: "transaction.raw"  (< 3 ms)
                                        │
                              Fraud Scoring Worker  (Node.js / Python)
                                        │
                          ┌─────────────┼────────────────┐
                          │             │                 │
                    Neo4j Query   Feature hydration   ONNX model
                    (graph hops)  from Redis Store    inference
                    < 15 ms       < 5 ms              < 20 ms
                          │             │                 │
                          └─────────────┴────────────────┘
                                        │
                                  Score aggregation
                                        │
                          ┌─────────────┼────────────────┐
                   APPROVED         FLAGGED            BLOCKED
                          │             │                 │
                   Write to PG   Write to PG       Write to PG
                   (async)       + emit            + emit
                                 alert.created     alert.created
                                 to Kafka          to Kafka
                                                         │
                                              Policy Engine picks up
```

### 3.2 Component Specifications

#### API Gateway contract
```
POST /v1/transactions
{
  "transactionId": "uuid-v4",
  "fromAccountId": "string",
  "toAccountId": "string",
  "amount": "decimal",
  "currency": "ISO-4217",
  "channel": "mobile|web|atm|branch",
  "deviceId": "string?",
  "ipAddress": "string?",
  "timestamp": "ISO-8601"
}
Response: 202 Accepted { "eventId": "...", "expectedOutcomeMs": 50 }
```

**Decision (ADR-001):** Return `202` immediately and push outcome via WebSocket/SSE rather than waiting synchronously. This decouples the mobile UX from ML latency variance.

#### Redis Stream schema
```
XADD transaction.raw * \
  transactionId  <uuid> \
  payload        <json-encoded above> \
  receivedAt     <epoch-ms>
```

#### Neo4j Graph query (hop check)
```cypher
MATCH path = (a:Account {id: $fromId})-[:TRANSACTED_WITH|SHARES_DEVICE|SHARES_IP*1..3]-(b:Account)
WHERE b.fraudRingId IS NOT NULL
RETURN count(path) AS hops, collect(b.fraudRingId)[0..5] AS rings
```
**Decision (ADR-002):** Cap graph traversal at 3 hops with a 15 ms timeout. Deeper traversal moves to an async enrichment pass that does not block approval.

#### ML Model (ONNX)
- **Model:** XGBoost trained on historical fraud labels, exported to ONNX for runtime-agnostic inference.
- **Input features (20 total):**  
  `amount_zscore`, `velocity_1h`, `velocity_24h`, `graph_hops`, `is_new_beneficiary`, `device_age_days`, `ip_country_risk`, `hour_of_day`, `day_of_week`, `channel_risk_score`, ... (full feature list in `docs/features/fraud_v1.md`)
- **Output:** `fraud_probability` ∈ [0, 1]
- **Thresholds:**
  | Score | Status | Action |
  |-------|--------|--------|
  | < 0.3 | APPROVED | proceed |
  | 0.3–0.7 | FLAGGED | step-up auth |
  | > 0.7 | BLOCKED | hold funds |

#### PostgreSQL schema (fraud events)
```sql
CREATE TABLE fraud_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  fraud_score     NUMERIC(5,4) NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('APPROVED','FLAGGED','BLOCKED')),
  graph_hops      INT,
  fraud_ring_ids  TEXT[],
  model_version   TEXT NOT NULL,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  shap_values     JSONB,           -- populated async by Explainability Worker
  audit_summary   TEXT            -- populated async by Explainability Worker
);
CREATE INDEX ON fraud_events (transaction_id);
CREATE INDEX ON fraud_events (status, scored_at DESC);
```

---

## 4. Feature 2 — Early Loan Default & Financial Distress Warning

### 4.1 Flow (daily batch, trigger on threshold breach)

```
Cron (00:00 UTC daily)
      │
      ▼
BullMQ Job: "loan-distress-batch"
      │
      ├── For each active borrower (paginated, 500/batch):
      │       │
      │       ├── Aggregate features from PostgreSQL
      │       │   (avg_monthly_balance, withdrawal_spike, new_credit_count, ...)
      │       │
      │       ├── Write/refresh Feature Store (Redis HSET per borrower)
      │       │
      │       ├── Run LightGBM model → distress_score (0–100)
      │       │
      │       └── Write score to loan_distress_scores table
      │
      └── Emit alert.created to Kafka for borrowers > threshold (default: 70)
```

### 4.2 Component Specifications

#### BullMQ job (Node.js worker)
```typescript
// workers/loanDistressBatch.ts
interface LoanDistressJob {
  batchId: string;
  borrowerIds: string[];   // paginated slice
  evaluationDate: string;  // ISO date
}
```

**Decision (ADR-003):** Use BullMQ (Redis-backed) rather than Celery (Python) so the entire real-time path and batch path share one Redis instance and one deployment language (Node.js). Python model inference is invoked via a lightweight FastAPI sidecar, keeping the ML runtime isolated without cross-language worker orchestration.

#### Feature aggregation SQL
```sql
-- executed per-borrower inside the worker
SELECT
  borrower_id,
  AVG(closing_balance) FILTER (WHERE txn_date >= NOW() - INTERVAL '30 days') AS avg_balance_30d,
  AVG(closing_balance) FILTER (WHERE txn_date >= NOW() - INTERVAL '60 days') AS avg_balance_60d,
  SUM(amount) FILTER (WHERE category='ATM_WITHDRAWAL' AND txn_date >= NOW() - INTERVAL '14 days') AS atm_14d,
  SUM(amount) FILTER (WHERE category='ATM_WITHDRAWAL' AND txn_date >= NOW() - INTERVAL '28 days') AS atm_28d,
  COUNT(*) FILTER (WHERE category='HIGH_INTEREST_CREDIT') AS new_high_interest_count
FROM transactions
WHERE borrower_id = $1
GROUP BY borrower_id;
```

#### Redis Feature Store schema
```
HSET borrower:{id}:features
  avg_balance_30d   <float>
  avg_balance_60d   <float>
  balance_drop_pct  <float>   -- derived: (60d - 30d) / 60d
  atm_spike_ratio   <float>   -- atm_14d / (atm_28d/2)
  new_credit_count  <int>
  last_updated      <epoch-ms>
EXPIRE borrower:{id}:features 90000   -- 25 hours
```

#### PostgreSQL schema (distress scores)
```sql
CREATE TABLE loan_distress_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id     UUID NOT NULL REFERENCES borrowers(id),
  distress_score  SMALLINT NOT NULL CHECK (distress_score BETWEEN 0 AND 100),
  risk_band       TEXT NOT NULL CHECK (risk_band IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  model_version   TEXT NOT NULL,
  features_snap   JSONB NOT NULL,   -- snapshot of features used
  evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  shap_values     JSONB,
  audit_summary   TEXT
);
CREATE INDEX ON loan_distress_scores (borrower_id, evaluated_at DESC);
CREATE INDEX ON loan_distress_scores (risk_band, evaluated_at DESC);
```

**Risk band thresholds:**
| Score | Band | Trigger |
|-------|------|---------|
| 0–39 | LOW | silent |
| 40–59 | MEDIUM | in-app nudge |
| 60–74 | HIGH | alert + CRM task |
| 75–100 | CRITICAL | alert + freeze offer + CRM call |

---

## 5. Feature 3 — Dual-Score Explainability & Audit Trail

### 5.1 Flow

```
Kafka: alert.created
      │
      ▼
Explainability Worker (consumes alert.created)
      │
      ├── Read model output + feature snapshot from PG
      │
      ├── Run SHAP TreeExplainer (Python sidecar)
      │   → top_3_drivers: [{feature, value, shap_contribution}]
      │
      ├── Build structured prompt:
      │   "Summarise in one sentence for a regulator.
      │    Score: {score}. Drivers: {drivers_json}"
      │
      ├── Call LLM (OpenAI / Gemini via structured output mode)
      │   → audit_summary: string (≤ 200 chars, deterministic seed)
      │
      └── UPSERT into fraud_events or loan_distress_scores:
            shap_values, audit_summary
          INSERT INTO audit_log (immutable append-only)
```

### 5.2 Component Specifications

#### LLM prompt template
```
SYSTEM: You are a financial risk compliance assistant.
        Output exactly ONE sentence. No markdown. No numbers beyond 2 d.p.
        Use the borrower/transaction terminology only.

USER: Risk score: {{score}}/100.
      Top contributing factors:
      {{#each drivers}}
      - {{feature_label}}: {{direction}} by {{magnitude}}
      {{/each}}
      Produce one regulator-ready audit sentence.

ASSISTANT:
```

**Decision (ADR-004):** Use `temperature=0` and `seed=42` on every LLM call. The output is stored verbatim. This makes the summary reproducible during audits and eliminates hallucination drift over time.

#### Immutable audit log table
```sql
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('FRAUD_EVENT','DISTRESS_SCORE')),
  entity_id       UUID NOT NULL,
  event_type      TEXT NOT NULL,   -- 'SCORED','EXPLAINED','INTERVENED','RESOLVED'
  actor           TEXT NOT NULL,   -- 'SYSTEM' or analyst user_id
  payload         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No UPDATE or DELETE ever runs on this table.
-- Enforce via PostgreSQL row-security policy + separate audit DB role.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert_only ON audit_log FOR INSERT TO audit_writer;
```

---

## 6. Feature 4 — Automated Graduated Interventions

### 6.1 Flow

```
Kafka: alert.created
      │
      ▼
Policy Engine (stateless Node.js service)
      │
      ├── Read alert payload (score, entity_type, entity_id, risk_band)
      │
      ├── Evaluate rule tree (JSON policy config, hot-reloadable)
      │
      └── Dispatch webhooks in parallel:
            ├── MEDIUM fraud → SMS/WhatsApp OTP gateway
            ├── HIGH fraud   → Payment Processor: freeze escrow
            ├── HIGH loan    → Loan CRM: create restructuring task
            └── CRITICAL loan→ Loan CRM: mark for outbound call
                               + Payment Processor: soft hold
      │
      ▼
Kafka: intervention.dispatched
      │
      ▼
Resolution Listener (WebSocket callback or webhook from external service)
      │
      ├── OTP verified   → update fraud_events.resolution = 'STEP_UP_PASSED'
      ├── OTP failed     → update fraud_events.resolution = 'STEP_UP_FAILED' → escalate
      └── Analyst action → update via Dashboard API → INSERT audit_log
```

### 6.2 Policy Rule Config (JSON, stored in DB + hot-reloaded)

```json
{
  "fraud": {
    "FLAGGED": {
      "actions": ["sms_otp", "whatsapp_otp"],
      "ttl_seconds": 120,
      "on_failure": "escalate_to_BLOCKED"
    },
    "BLOCKED": {
      "actions": ["freeze_escrow"],
      "notify": ["analyst_dashboard"]
    }
  },
  "distress": {
    "MEDIUM": { "actions": ["in_app_nudge"] },
    "HIGH":   { "actions": ["crm_task", "in_app_nudge"] },
    "CRITICAL":{ "actions": ["crm_task", "crm_call", "soft_hold"] }
  }
}
```

**Decision (ADR-005):** Rules are stored as versioned JSON in PostgreSQL and loaded at startup, with a Redis pub/sub channel for hot-reload without restart. This lets compliance teams update thresholds without a deployment.

### 6.3 State Machine (fraud resolution)

```
PENDING ──► FLAGGED ──► STEP_UP_SENT ──► STEP_UP_PASSED ──► APPROVED
                    │                └──► STEP_UP_FAILED ──► BLOCKED
                    └──► BLOCKED ──────────────────────────► BLOCKED
```

State transitions are persisted to `fraud_events.resolution` and always appended to `audit_log`.

---

## 7. Feature 5 — Unified Live Risk Dashboard

### 7.1 Real-time push architecture

```
PostgreSQL NOTIFY (triggers on INSERT to fraud_events / loan_distress_scores)
      │
      ▼
Dashboard Gateway (Node.js, Socket.io)
      │  maintains room per analyst session
      ▼
Browser (React/Next.js)
      ├── Alert feed (sorted by severity)
      ├── Cytoscape.js graph (fraud ring visualisation)
      └── Resolution action panel
```

**Decision (ADR-006):** Use PostgreSQL `LISTEN/NOTIFY` → Dashboard Gateway → Socket.io rather than Kafka → gateway, because alert volume is low (< 1000/min) and this avoids an extra Kafka consumer group. For scale-out, swap to Kafka consumer at >10k alerts/min with no frontend change.

### 7.2 Neo4j graph query for frontend render

```cypher
// Called by Dashboard Gateway on analyst request
MATCH (a:Account {id: $accountId})-[r]-(b:Account)
WHERE type(r) IN ['TRANSACTED_WITH','SHARES_DEVICE','SHARES_IP']
RETURN a, b, r LIMIT 100
```

Response is serialised to Cytoscape.js `elements` format by the Gateway before pushing to the client.

### 7.3 Analyst action API
```
POST /v1/alerts/:id/resolve
{
  "resolution": "OVERRIDE_APPROVE" | "CONFIRM_BLOCK" | "ESCALATE",
  "analystNote": "string"
}
```
This writes to `fraud_events`, appends to `audit_log`, and emits a Socket.io broadcast so all connected analysts see the update instantly.

---

## 8. Infrastructure & Deployment

### 8.1 Service inventory

| Service | Runtime | Scaling model | SLO |
|---------|---------|--------------|-----|
| API Gateway | Kong / AWS API GW | auto-scale | 99.99% |
| Transaction Ingestion API | Node.js (Fastify) | horizontal pods | p99 < 10 ms |
| Fraud Scoring Worker | Node.js + Python ONNX sidecar | horizontal pods | p99 < 50 ms |
| Loan Distress Batch | Node.js (BullMQ) | single pod (cron-triggered) | completes in < 2 h |
| Explainability Worker | Python (SHAP + LLM client) | horizontal pods | p99 < 5 s |
| Policy Engine | Node.js (Fastify) | horizontal pods | p99 < 30 ms |
| Dashboard Gateway | Node.js (Socket.io) | sticky-session pods | 99.9% |
| PostgreSQL | Managed (RDS / Supabase) | read replicas | 99.99% |
| Redis | Managed (ElastiCache / Upstash) | cluster mode | 99.99% |
| Neo4j | Neo4j AuraDB | managed | 99.9% |
| Kafka | Managed (Confluent / MSK) | 3-broker cluster | 99.99% |

### 8.2 Observability stack

- **Tracing:** OpenTelemetry → Jaeger / Tempo — every transaction tagged with `transactionId` from ingestion through to resolution.
- **Metrics:** Prometheus + Grafana — dashboards for fraud score distribution, model latency percentiles, batch job duration.
- **Logging:** Structured JSON → Loki / CloudWatch — log level ≥ WARN in prod.
- **Alerting:** PagerDuty — fires on: model p99 > 80 ms, batch job failure, Kafka consumer lag > 10k.

### 8.3 Security controls

| Control | Implementation |
|---------|---------------|
| Auth (external) | JWT RS256, 15 min expiry |
| Auth (internal) | mTLS between microservices |
| Secret management | HashiCorp Vault / AWS Secrets Manager |
| Data at rest | AES-256 (managed by cloud provider) |
| Data in transit | TLS 1.3 everywhere |
| Audit table integrity | Postgres RLS + append-only DB role |
| LLM prompt injection | Strict structured output schema; no user data in system prompt |
| PII masking | Account numbers masked in logs with a reversible token |

---

## 9. Blocking Edges for `/to-tickets`

These are hard dependencies between implementation work. No ticket can start until its blockers are resolved.

```
[1] PostgreSQL schema migrations
    └──► [2] Transaction Ingestion API
    └──► [3] Fraud Scoring Worker (writes fraud_events)
    └──► [4] Loan Distress Batch (writes loan_distress_scores)
    └──► [5] Audit Log table

[2] Transaction Ingestion API + Redis Streams
    └──► [3] Fraud Scoring Worker (reads stream)

[3] Fraud Scoring Worker (emits alert.created)
    └──► [6] Explainability Worker (reads alert.created)
    └──► [7] Policy Engine (reads alert.created)

[4] Loan Distress Batch
    └──► [6] Explainability Worker
    └──► [7] Policy Engine

[5] Audit Log table
    └──► [6] Explainability Worker (writes)
    └──► [7] Policy Engine (writes)
    └──► [8] Dashboard Analyst API (writes on resolution)

[7] Policy Engine
    └──► [9] SMS/OTP Webhook integration
    └──► [10] Payment Processor freeze integration
    └──► [11] Loan CRM integration

[3] Fraud Scoring Worker + Neo4j schema
    └──► [12] Neo4j seeding / graph population pipeline

[12] Neo4j graph
    └──► [13] Dashboard Gateway graph query endpoint

[13] Dashboard Gateway
    └──► [14] React/Next.js Dashboard frontend
```

---

## 10. Open Architecture Decisions (for grilling)

These questions remain unanswered and must be resolved before `/to-tickets`:

1. **Model hosting:** Run ONNX/LightGBM in-process (Node.js ONNX runtime) or via a Python FastAPI sidecar? Sidecar is cleaner but adds a network hop. In-process is faster but couples runtimes.
2. **Kafka vs Redis Streams only:** Redis Streams are simpler but have limited replay. Kafka adds operational cost. What is the acceptable data retention window for transaction events?
3. **Neo4j hosting:** Self-hosted (Docker, on-prem) or Neo4j AuraDB (managed SaaS)? Managed is preferred unless data sovereignty blocks it.
4. **LLM provider:** OpenAI GPT-4o-mini (cheapest deterministic), Gemini Flash, or self-hosted Mistral? Latency and cost trade-off needed.
5. **Multi-tenancy:** Is this a single bank deployment or a SaaS product serving multiple banks? This changes the data isolation model significantly.
6. **Dashboard auth:** Analyst SSO (SAML/OIDC with existing bank IdP) vs. standalone credential management?
7. **Graph write path:** When does the Neo4j graph get updated? Real-time (on every transaction) or daily batch? Real-time is more accurate but adds write load to the hot path.
