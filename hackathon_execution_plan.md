# Aedis Smart Assistant — 2-Developer Hackathon Execution Plan

> **Goal:** Win the hackathon by delivering an ultra-fast, bank-grade architecture running completely on **Localhost & Docker Compose**.
> **Methodology:** Matt Pocock's tracer-bullet modular development with strict contract boundaries, zero idle blocking, and parallel execution.

---

## 1. Developer Division & Ownership Matrix

To eliminate merge conflicts and waiting, the system is split along a clean boundary:
- **Developer 1 (Data, ML & High-Speed Core Engine)**: Owns Docker infrastructure, PostgreSQL/Neo4j data pipelines, Python FastAPI ML service, and real-time graph synchronization.
- **Developer 2 (Platform APIs, Intelligence Orchestration, Policy & Frontend)**: Owns Standalone Auth, Redis Streams orchestration, OpenRouter LLM explainability, Policy Engine, and the Next.js Cytoscape.js live dashboard.

```
┌─────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────┐
│  Developer 1: Core Engine & ML Data Specialist          │  Developer 2: Platform, Agentic Policy & UI Lead        │
├─────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ • Docker Compose base stack (Postgres, Redis, Neo4j)    │ • API Gateway & Standalone JWT Authentication           │
│ • Database Migrations (Multi-tenant, RLS, Audit table)  │ • Redis Streams pub/sub consumer framework              │
│ • Python FastAPI Service (ONNX XGBoost, LightGBM, SHAP) │ • OpenRouter LLM Prompt & Audit Summary Pipeline        │
│ • Self-Hosted Neo4j schema & Real-Time Graph Sync Worker│ • Policy Engine & Graduated Intervention Webhooks       │
│ • Sub-50ms Fraud Scoring & Feature Hydration engine     │ • Next.js Real-Time Risk Dashboard (Socket.io)          │
│ • Synthetic Bank Attack Simulator (Mule ring scenario)  │ • Cytoscape.js interactive graph visualizer & Actions   │
└─────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘
```

---

## 2. Local Docker Infrastructure Blueprint

Both developers share a single `docker-compose.yml` defining the bank-grade local perimeter:

```yaml
version: '3.8'

services:
  # 1. Primary Relational DB (Multi-Tenant + RLS + Audit Log)
  postgres:
    image: postgres:16-alpine
    container_name: aedis-postgres
    environment:
      POSTGRES_USER: aedis_admin
      POSTGRES_PASSWORD: aedis_password
      POSTGRES_DB: aedis_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

  # 2. Unified Event Bus & Feature Store (Streams + BullMQ)
  redis:
    image: redis:7.2-alpine
    container_name: aedis-redis
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

  # 3. Self-Hosted Graph DB (Fraud Ring & Mule Detection)
  neo4j:
    image: neo4j:5.18-community
    container_name: aedis-neo4j
    environment:
      NEO4J_AUTH: neo4j/aedis_password
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_dbms_security_procedures_unrestricted: apoc.*
    ports:
      - "7474:7474" # Browser UI
      - "7687:7687" # Bolt protocol
    volumes:
      - neo4jdata:/data

  # 4. Python ML & Explainability Microservice
  ml-service:
    build: ./services/ml-service
    container_name: aedis-ml-service
    ports:
      - "8000:8000"
    environment:
      - MODEL_ENV=production
    depends_on:
      - redis

volumes:
  pgdata:
  redisdata:
  neo4jdata:
```

---

## 3. Phase-by-Phase Sprint Plan (24-Hour Timeline)

### Phase 0: Foundations & Local Docker Spine (Hours 0 – 3)
*Goal: Get the local infrastructure running with a complete end-to-end "hello world" tracer bullet.*

| Developer | Tasks | Deliverables |
|-----------|-------|--------------|
| **Dev 1** | 1. Create `docker-compose.yml` for Postgres, Redis, Neo4j.<br>2. Write SQL schema: `tenants`, `users`, `transactions`, `fraud_events`, `loan_distress_scores`, and append-only `audit_log`.<br>3. Set up Neo4j unique constraints on `(:Account {id, tenantId})`, `(:Device {id})`, `(:IPAddress {ip})`. | `docker-compose up -d` brings up all 3 datastores ready with initialized tables and constraints. |
| **Dev 2** | 1. Set up Node.js Fastify API Gateway with TypeScript.<br>2. Implement Standalone Auth: `/v1/auth/login` returning RS256 JWT with tenant ID & roles.<br>3. Create Redis Streams helper module (`xadd`, `xreadgroup`, `xack`).<br>4. Expose `POST /v1/transactions` pushing to `stream:transaction:raw`. | Can log in, get a JWT, and POST a transaction that lands in Redis Stream within 5ms. |

> **Checkpoint 1:** Dev 2 makes `curl POST /v1/transactions` -> Dev 1 verifies event exists in Redis via `redis-cli XREVRANGE stream:transaction:raw + - COUNT 1`.

---

### Phase 1: Real-Time Scoring & Intelligence Engine (Hours 3 – 8)
*Goal: Sub-50ms fraud scoring loop + daily loan distress pipeline.*

| Developer | Tasks | Deliverables |
|-----------|-------|--------------|
| **Dev 1** | 1. **Python FastAPI ML Service** (`ml-service`):<br>   - Export pre-trained XGBoost fraud classifier to ONNX format.<br>   - Implement `POST /v1/models/fraud/score` running ONNX runtime (< 10ms).<br>   - Implement `POST /v1/models/distress/score-batch` using LightGBM.<br>2. **Real-Time Graph Sync Worker**:<br>   - Reads `stream:transaction:raw`.<br>   - Cypher `MERGE` to update accounts, devices, and `TRANSACTED_WITH` relationships in Neo4j. | Python ML service returns sub-15ms inferences. Neo4j graph updates automatically as transactions flow. |
| **Dev 2** | 1. **Fraud Scoring Worker** (`services/fraud-worker`):<br>   - Consumes `stream:transaction:raw`.<br>   - Cypher 3-hop check on Neo4j for mule connections.<br>   - Hydrates velocity features from Redis Feature Store.<br>   - Calls Python ML service -> evaluates APPROVED / FLAGGED / BLOCKED.<br>   - Writes to Postgres `fraud_events` & emits to `stream:alert:created`.<br>2. **Loan Distress Batch Worker**:<br>   - BullMQ cron job computing 30d/60d balance drops & calling LightGBM batch endpoint. | Ingestion to Postgres scoring result executes in under 45ms. High-risk transactions emit to `stream:alert:created`. |

> **Checkpoint 2:** Fire a rapid burst of 5 micro-transfers followed by a big transfer. System automatically marks the 6th transfer as `FLAGGED` or `BLOCKED` with graph hops detected!

---

### Phase 2: Explainability, Policy & Interventions (Hours 8 – 14)
*Goal: Dual-score explainability (SHAP + OpenRouter) and automated graduated interventions.*

| Developer | Tasks | Deliverables |
|-----------|-------|--------------|
| **Dev 1** | 1. **Python SHAP Endpoint** in `ml-service`:<br>   - `POST /v1/models/explain/shap` calculating TreeExplainer top 3 drivers.<br>2. **PostgreSQL Tamper-Proof Trigger**:<br>   - PL/pgSQL function preventing UPDATE or DELETE on `audit_log`.<br>3. **Synthetic Attack Data Generator Script**:<br>   - Seeds realistic bank data: 50 accounts, a 5-node mule ring, device sharing patterns. | Python returns top numerical SHAP drivers. Database rejects any attempt to mutate audit records. Realistic demo dataset ready. |
| **Dev 2** | 1. **Explainability Worker** (`services/explain-worker`):<br>   - Consumes `stream:alert:created`.<br>   - Calls Python SHAP endpoint for numerical drivers.<br>   - Calls OpenRouter API (`google/gemini-2.0-flash-001` or `gpt-4o-mini`) with `temperature: 0` and structured JSON schema.<br>   - Writes 1-sentence regulator summary and raw SHAP into `audit_log`.<br>2. **Policy & Rules Engine** (`services/policy-engine`):<br>   - Hot-reloadable policy matrix from Postgres.<br>   - Dispatches graduated webhooks (mock SMS OTP gateway, mock Payment Escrow freeze).<br>   - Emits `stream:intervention:dispatched`. | Full audit trail generated: numbers converted to natural language sentences; webhooks triggered dynamically based on severity. |

> **Checkpoint 3:** Transaction triggers alert -> OpenRouter creates summary: *"Default risk 78%: Cash reserves dropped 82% over 14 days and ATM withdrawals spiked 4x"* -> Immutable audit log holds both SHAP values and sentence.

---

### Phase 3: Unified Live Risk Dashboard & Visual Graph (Hours 14 – 20)
*Goal: Killer UI for judges with live WebSocket push and Cytoscape.js graph visualizer.*

| Developer | Tasks | Deliverables |
|-----------|-------|--------------|
| **Dev 1** | 1. **Graph & Analytics API Endpoints**:<br>   - `GET /v1/dashboard/graph/:accountId` querying Neo4j and converting to Cytoscape.js nodes/edges JSON.<br>   - `GET /v1/dashboard/metrics` (fraud rate, p99 latency, alerts by risk band).<br>2. **Analyst Resolution API**:<br>   - `POST /v1/alerts/:id/resolve` (Override Approve vs Confirm Fraud).<br>   - Updates Postgres state machine and writes analyst name to `audit_log`. | Backend APIs deliver rich graph data and handle resolution actions with full audit tracking. |
| **Dev 2** | 1. **Next.js Dashboard Frontend**:<br>   - Socket.io connection to Dashboard Gateway for zero-reload live alert updates.<br>   - Real-time alert feed cards colored by severity (Green, Amber, Red).<br>   - **Cytoscape.js Fraud Ring Canvas**: Interactive graph highlighting shared devices, IPs, and mule accounts in red.<br>   - **Explainability Drawer**: Displays SHAP bar chart + OpenRouter regulatory summary.<br>   - 1-Click Action Buttons ("Step-Up OTP", "Freeze Escrow", "Override"). | Gorgeous, dark-mode, responsive dashboard that updates live in real-time as transactions flow. |

> **Checkpoint 4:** Complete end-to-end loop: trigger transaction in terminal -> card pops up in UI via WebSocket -> click card -> Cytoscape.js renders the fraud ring -> click "Confirm Fraud" -> audit log updated.

---

### Phase 4: Polish, Benchmark & Pitch Script (Hours 20 – 24)
*Goal: Benchmark proof, demo scenario rehearsal, and winning pitch.*

| Developer | Tasks | Deliverables |
|-----------|-------|--------------|
| **Dev 1** | 1. Run latency benchmark using `autocannon` or `k6`:<br>   - Prove sub-50ms end-to-end latency under 1,000 req/sec on localhost.<br>2. Prepare automated demo trigger script (`npm run demo:scam-ring` and `npm run demo:loan-distress`). | Benchmark markdown report showing p50, p90, p99 latencies to show judges. |
| **Dev 2** | 1. UI micro-interactions, dark-mode styling, loading spinners, sound cue on incoming Critical alert.<br>2. Record 2-minute backup demo video.<br>3. Structure the 3-minute pitch deck following the judge scoring rubric. | Flawless live demo flow and presentation deck. |

---

## 4. The 3-Minute Hackathon Demo Script (How to Win)

Judges in fintech/banking look for 3 things: **Speed (SLO)**, **Explainability (Compliance/Regulator ready)**, and **Actionability (Graduated Interventions vs dumb block/allow)**.

```
0:00 - 0:45 | The Problem & Architecture Hook
"Banks lose $30B+ to mule networks and loan defaults. Legacy rules are too slow (batch) 
or black-box. We built Aedis: a sub-50ms real-time intelligence engine running Redis Streams, 
self-hosted Neo4j, Python ONNX, and OpenRouter explainability."

0:45 - 1:45 | Live Demo 1: Real-Time Mule & Scam Ring (Features 1, 4 & 5)
1. Run `npm run demo:scam-ring` in terminal.
2. Show Dashboard: WebSocket card immediately appears in Red: "BLOCKED (Score: 0.92)".
3. Click Cytoscape.js Graph tab: Reveal the 3-hop mule ring sharing the same device ID.
4. Show the Graduated Action taken: Escrow frozen automatically without manual delay.
5. Latency badge: Show p99 = 38ms!

1:45 - 2:30 | Live Demo 2: Early Distress Warning & Dual Explainability (Features 2 & 3)
1. Switch to Credit Officer view.
2. Select borrower with Distress Score 78/100 (evaluated by LightGBM).
3. Open Explainability Drawer: Show SHAP drivers and the OpenRouter 1-sentence regulatory summary:
   "Default risk 78%: Cash reserves dropped 82% over 14 days and ATM withdrawals spiked 4x."
4. Show PostgreSQL query proving the immutable append-only audit log.

2:30 - 3:00 | Bank-Grade Tech Feat & Wrap-up
"Everything you saw is containerized, multi-tenant with Row-Level Security, and zero cloud lock-in. 
Aedis gives banks real-time protection with regulator-grade explanations."
```

---

## 5. Next Immediate Action for Dev 1 & Dev 2

1. **Dev 1**: Clone repo, create directory structure:
   ```bash
   mkdir -p infra/postgres services/ml-service services/api-gateway services/dashboard
   ```
   Drop in the `docker-compose.yml` above and run `docker compose up -d`.
2. **Dev 2**: Initialize the API Gateway project in `services/api-gateway` (`npm init -y`, install `fastify`, `@fastify/jwt`, `ioredis`) and implement `POST /v1/transactions`.
