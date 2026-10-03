# FINTECHSTICO '26 — Risk & Fraud Intelligence Platform

> **Consilium '26 · The Annual Business Conclave of NSUT**  
> Organized by The Finance & Economics Society (FES) · NSUT Delhi

FINTECHSTICO '26 is an enterprise-grade risk intelligence and fraud surveillance dashboard featuring real-time scam & mule detection, early loan default forecasting, dual-score SHAP explainability, and automated graduated interventions.

---

## Tech Stack Overview

- **Frontend**: Next.js (App Router) · React · TypeScript · Tailwind CSS · Plus Jakarta Sans
- **Backend Architecture**: FastAPI · Python
- **Event Processing**: Redis Streams · BullMQ · WebSockets / SSE
- **Databases**: PostgreSQL (Immutable Audit Partitioning) · Neo4j (Graph Network Hops)
- **ML / Risk Engine**: ONNX Runtime (C++ Accelerated) · XGBoost · LightGBM · SHAP
- **AI & Explainability**: LangGraph · LangChain · LLM Gateway with Input Sanitization Guardrails

---

## Frontend Info

### 1. Platform Operation & Navigation

The frontend is structured around a **responsive left navigation sidebar** with 5 primary operational interfaces:

| Module | Identifier | Purpose & Capabilities |
| :--- | :--- | :--- |
| **Fraud & Mule Sentinel** | `[01]` | Real-time scam detection, sub-50ms ONNX XGBoost scoring, and interactive Neo4j 3-hop mule ring topology inspection. |
| **Loan Default Distress** | `[02]` | Background 14-day cash-flow decay monitoring, LightGBM distress scoring (0–100), and automated WhatsApp/SMS workout playbooks. |
| **Dual-Score Explainability** | `[03]` | Mathematical SHAP additive feature vectors paired with LangGraph plain-English summaries and immutable PostgreSQL audit trails. |
| **Microservices Telemetry** | `[04]` | Real-time queue telemetry (Redis Streams, BullMQ, Neo4j, ONNX) and dynamic friction threshold policy matrix tuner. |
| **Risk DNA Simulator** | `[05]` | Interactive test bench for live jury demonstrations: craft custom transaction vectors and evaluate the ML + SHAP + NLP pipeline live. |

#### Quick Operational Controls:
- **Live Stream Toggle**: Use `[ LIVE STREAM: ACTIVE / PAUSED ]` in the left sidebar to control real-time ingestion.
- **Scam Burst Injector**: Click `[ + INJECT SCAM BURST ]` to simulate an instant critical attack ($195,000 extraction attempt with rooted hardware) to verify automated escrow freeze actions.
- **Dynamic Friction Actions**:
  - `[1. FREEZE ESCROW]` — Instantly locks funds and quarantines linked mule clusters.
  - `[2. CHALLENGE OTP]` — Launches step-up biometric/SMS OTP modal (Code: `8842` simulates customer verification).
  - `[3. OVERRIDE & APPROVE]` — Clears the transaction with an immutable audit stamp.

---

### 2. Live Risk Simulation Walkthrough (Role [05])

The **Financial Behaviour DNA** formula evaluates risk across 6 dimensional vectors:
$$\text{Risk} = f(\text{Customer}, \text{Transaction}, \text{Behavior}, \text{Context}, \text{Network}, \text{History})$$

#### Step-by-Step Simulation:
1. **Configure Transaction Vectors**:
   - **Sender & Amount**: Input sender name, transfer amount, and liquid reserve baseline.
   - **Beneficiary Network Profile**: Select `MULE RING NODE`, `NEW UNKNOWN`, or `WHITELISTED`.
   - **Circadian & Session Velocity**: Select `NIGHT (03:42 AM)` vs `DAY (02:15 PM)`, and `POST-RESET` (3 minutes after credential change) vs `NORMAL`.
   - **Hardware Environment**: Select `EMULATOR BOT`, `TOR RELAY`, or `TRUSTED HW`.
2. **Execute Pipeline**:
   - Click `[ EXECUTE RISK EVALUATION PIPELINE ]`.
3. **Inspect Output**:
   - **Mathematical SHAP Breakdown**: View exact additive weights (e.g., `+34 Amount 14x baseline`, `+24 Linked to Mule Ring`, `+22 Android Emulator`).
   - **LangGraph NLP Explanation**: Regulator-friendly natural language audit sentence.
   - **Triggered Dynamic Action**: `SILENT_PASS`, `STEP_UP_OTP`, or `ESCROW_FREEZE`.
   - Automatically appended to the live stream and immutable audit log.

---

### 3. KPI Definitions & Meanings

#### Global Top KPI Strip
- **Live Ingestion Velocity (`1,425 TX/SEC`)**: Number of live financial transactions processed per second through the Redis buffer queue.
- **ONNX Inference Latency (`36.4 MS`)**: P99 end-to-end inference speed of the compiled C++ XGBoost model, guaranteeing sub-50ms SLA.
- **Isolated Threats & Mules (`BLOCKED Count`)**: Cumulative malicious transactions and accounts quarantined in escrow across active Neo4j mule rings.
- **AI Guardrails Compliance (`100.0% PASS`)**: Percentage of LangGraph audit explanations verified against prompt injection, hallucination, and bias.

#### Specific Module KPIs
- **Evaluation Latency (`38.4 MS`)**: Real-time scoring time for the currently selected transaction payload.
- **Graph Hop Depth (`3 HOPS`)**: Number of network hops connecting the sender or beneficiary to an identified mule cluster in Neo4j.
- **Monitored Loan Portfolio (`$1.22M`)**: Total active loan principal currently tracked for background cash-flow distress.
- **Danger Cutoff (`Score > 65`)**: Threshold where the system automatically dispatches early pre-default outreach (WhatsApp payment split or interest moratorium).

---

### 4. Backend Endpoints & Service Integration

The frontend connects to the backend through REST, WebSockets, and queue channels:

#### REST Endpoints
- `POST /api/v1/transactions/evaluate`: Ingests transaction, runs ONNX + SHAP + LangGraph, returns score and NLP summary.
- `POST /api/v1/transactions/{id}/action`: Applies analyst intervention mutation (`FREEZE`, `OTP_CHALLENGE`, `APPROVE`) with audit logs.
- `GET /api/v1/graph/nodes/{id}?depth=3`: Traverses Neo4j for mule rings, shared device IDs, and IP clusters.
- `GET /api/v1/credit/borrowers?filter=DISTRESS_GT_65`: Returns borrowers with high 14-day cash-flow decay and LightGBM scores.
- `POST /api/v1/credit/playbook/dispatch`: Triggers automated WhatsApp/SMS restructuring offers.
- `GET /api/v1/audit/records?limit=50`: Retrieves append-only PostgreSQL immutable audit logs with SHA-256 hashes.
- `POST /api/v1/policy/thresholds`: Updates global dynamic friction thresholds in the rules engine.

#### Real-Time Event Streams
- `ws://localhost:8000/ws/v1/alerts`: WebSocket alert feed pushing new high-risk transactions and mule cluster expansions in real time.
- `GET /api/v1/stream/transactions`: Server-Sent Events (SSE) feed for live ingestion queues.

#### Microservices & Queues
- **Redis Stream Topic**: `stream:transactions:incoming` (low-latency transaction ingestion buffer).
- **BullMQ Batch Queue**: `queue:credit:daily-distress-cron` (nightly borrower cash reserve decay evaluator).
- **Neo4j Cypher Database**: Bolt connection on `bolt://localhost:7687` for multi-hop graph queries.
- **PostgreSQL Database**: Tables `transactions`, `borrower_distress`, `immutable_audit_log`.

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation & Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Run development server
npm run dev

# 3. Open in browser
# Navigate to http://localhost:3000 (or the port specified in terminal)
```

### Production Build

```bash
npm run build
npm run start
```
