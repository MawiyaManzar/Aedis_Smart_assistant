<div align="center">

<br/>

<h1>A &nbsp;E &nbsp;D &nbsp;I &nbsp;S</h1>

<h3>S M A R T &nbsp;&nbsp; A S S I S T A N T</h3>

<p><sub><b>&#9472;&#9472;&#9472;&#9472;&#9472;&nbsp; F I N T E C H S T I C O &nbsp;' 2 6 &nbsp;&#9472;&#9472;&#9472;&#9472;&#9472;</b></sub></p>

<p><b><i>Risk &amp; Fraud Intelligence Platform</i></b></p>

<hr width="55%"/>

<br/>

### **Catch scam rings in real time. Warn about loan defaults weeks early. Explain every decision in plain language.**

<br/>

<p align="center">
  <a href="#1-project-overview"><img src="https://img.shields.io/badge/Event-Consilium%20'26-0ea5e9?style=for-the-badge" alt="Consilium 26"/></a>
  <a href="#1-project-overview"><img src="https://img.shields.io/badge/Product-Aedis%20Smart%20Assistant-14b8a6?style=for-the-badge" alt="Aedis"/></a>
  <a href="#5-system-architecture"><img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"/></a>
  <a href="#5-system-architecture"><img src="https://img.shields.io/badge/Frontend-Next.js%2016-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js"/></a>
  <a href="#7-ai--ml--intelligence"><img src="https://img.shields.io/badge/Fraud%20ML-XGBoost%20%2B%20ONNX-EC6B23?style=for-the-badge" alt="XGBoost ONNX"/></a>
  <a href="#7-ai--ml--intelligence"><img src="https://img.shields.io/badge/Credit%20ML-LightGBM-2E8B57?style=for-the-badge" alt="LightGBM"/></a>
  <a href="#7-ai--ml--intelligence"><img src="https://img.shields.io/badge/Explainability-SHAP%20%2B%20LLM%20Guardrails-FF0051?style=for-the-badge" alt="SHAP"/></a>
  <a href="#6-core-features"><img src="https://img.shields.io/badge/Graph-Neo4j%203--Hop-008CC1?style=for-the-badge&logo=neo4j&logoColor=white" alt="Neo4j"/></a>
</p>

<p align="center">
  <a href="#5-system-architecture"><img src="https://img.shields.io/badge/Feature%20Store-Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"/></a>
  <a href="#5-system-architecture"><img src="https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/></a>
  <a href="#6-core-features"><img src="https://img.shields.io/badge/Audit-Append--Only-7c3aed?style=for-the-badge" alt="Audit"/></a>
  <a href="#9-results-impact--demonstration"><img src="https://img.shields.io/badge/Tests-204%20Passing-22c55e?style=for-the-badge" alt="Tests"/></a>
  <a href="#9-results-impact--demonstration"><img src="https://img.shields.io/badge/Training%20Data-Synthetic-f59e0b?style=for-the-badge" alt="Synthetic data"/></a>
  <a href="#10-technology-stack--project-showcase"><img src="https://img.shields.io/badge/Status-Hackathon%20Prototype-f97316?style=for-the-badge" alt="Prototype"/></a>
  <a href="#7-ai--ml--intelligence"><img src="https://img.shields.io/badge/OpenRouter%20LLM-Optional-6467F2?style=for-the-badge" alt="OpenRouter"/></a>
</p>

<sub>Built for <b>Consilium '26 &middot; FINTECHSTICO</b> by the Finance &amp; Economics Society (FES), NSUT Delhi</sub>

<br/>

<table align="center">
  <tr>
    <td align="center"><b>Graph-aware<br/>fraud detection</b></td>
    <td align="center"><b>Early loan-distress<br/>warning</b></td>
    <td align="center"><b>Number-verified<br/>explanations</b></td>
    <td align="center"><b>Append-only<br/>audit trail</b></td>
  </tr>
</table>

</div>

<br/>

---

## 1. Project Overview

> **Aedis Smart Assistant** is a bank-side risk platform that does two jobs with one shared intelligence layer.

| | Module | What it does |
|:-:|---|---|
| **1** | **Fraud & Mule Sentinel** | Scores every transaction as it arrives and uses a **graph database** to spot *networks* of mule accounts, not just single suspicious payments. |
| **2** | **Loan Default Distress** | Reads each borrower's recent cash-flow behaviour and raises an **early warning** before an EMI is missed. |

Every score is paired with a **plain-language explanation** and **signed numeric drivers (SHAP)**. Every action an analyst takes lands in an **append-only audit trail**.

### What makes it different

| Typical tool | Aedis |
|---|---|
| Scores one transaction in isolation | Scores the transaction **and its place in a connected graph** of accounts, devices and IPs |
| Black-box "risk: 87%" | A number **plus** a readable reason built only from the real inputs |
| Fraud and credit risk live in separate systems | **One platform**, one analyst console, one audit trail |
| Silent failure when a component is down | An explicit **DEGRADED** state and a rule-based fallback, never a fake score |

### Key capabilities

<table>
  <tr>
    <th align="center">Graph intelligence</th>
    <th align="center">Fast scoring</th>
    <th align="center">Explainability</th>
    <th align="center">Accountability</th>
  </tr>
  <tr>
    <td align="center">Bounded <b>3-hop</b> mule-ring detection in Neo4j</td>
    <td align="center"><b>XGBoost</b> exported to <b>ONNX</b> for low-overhead inference</td>
    <td align="center"><b>SHAP</b> drivers plus number-verified plain-language text</td>
    <td align="center"><b>Append-only</b> audit log and analyst resolve workflow</td>
  </tr>
</table>

**Value proposition:** analysts see **who is connected to whom**, **why** a score is high, and **what to do next** on one screen, with nothing hidden and nothing invented.

> [!NOTE]
> All models are trained on **synthetic data**. Metrics in this document describe that synthetic benchmark, **not** real-bank performance. See [Section 9](#9-results-impact--demonstration).

<div align="center">
<img src="docs/assets/dashboard-fraud-sentinel.png" alt="Fraud Sentinel dashboard" width="90%"/>
<br/><sub><i>Fraud &amp; Mule Sentinel: live ingestion stream</i></sub>
</div>

<br/>

---

## 2. Problem & Motivation

> Banks fight two expensive problems that look unrelated but share one weakness: **the warning signs are spread across many events and many accounts, and nobody sees the whole picture in time.**

```mermaid
flowchart LR
    A["<b>CURRENT SITUATION</b><br/><br/>Rules score one payment at a time<br/>Fraud and credit teams use separate tools<br/>Scores arrive without reasons"]
    B["<b>PROBLEMS</b><br/><br/>Mule rings split money across many accounts<br/>Distress is noticed only after a missed EMI<br/>Analysts cannot justify or audit decisions"]
    C["<b>UNMET NEED</b><br/><br/>A connected, explainable, auditable<br/>view of fraud AND credit risk,<br/>early enough to act"]
    A ==> B ==> C
    style A fill:#f4efe6,stroke:#222,stroke-width:2px,color:#111
    style B fill:#fde2e0,stroke:#c0392b,stroke-width:2px,color:#111
    style C fill:#e3f4e6,stroke:#1e8449,stroke-width:2px,color:#111
```

| Question | Answer |
|---|---|
| **Who feels it?** | Risk analysts, credit officers, compliance auditors, and the customers who lose savings or receive late, blunt collection calls. |
| **Why does it matter?** | A scam ring can move a victim's balance through several accounts in **minutes**. A late default notice costs the bank and the borrower far more than an early, gentle offer. |
| **Why do current tools fall short?** | Single-transaction rules cannot see **shared devices, shared IPs or beneficiary chains**. Opaque scores cannot be defended to a regulator. |
| **What motivated this project?** | To show that **graph context**, **early cash-flow signals** and **honest explanations** can sit in one platform that an analyst can actually trust and audit. |

<br/>

---

## 3. Proposed Solution

> **Core idea:** treat risk as a *connected* problem, and make every answer *readable*.

```mermaid
flowchart LR
    subgraph P["PROBLEM"]
        p1["Isolated transaction scores"]
        p2["Late default detection"]
        p3["Unexplained decisions"]
        p4["No audit trail"]
    end
    subgraph S["AEDIS SOLUTION"]
        s1["ML score + 3-hop graph context"]
        s2["Daily cash-flow distress score<br/>with banded playbooks"]
        s3["SHAP drivers + plain-language<br/>explanation using real numbers"]
        s4["Append-only audit log +<br/>analyst resolve workflow"]
    end
    p1 ==> s1
    p2 ==> s2
    p3 ==> s3
    p4 ==> s4
    style P fill:#fde2e0,stroke:#c0392b,stroke-width:2px
    style S fill:#e3f4e6,stroke:#1e8449,stroke-width:2px
```

### What changes for the user

| Before | With Aedis |
|---|---|
| *"Transaction flagged."* | *"Fraud risk 87/100, blocked: the receiving account is 1 hop from a known mule and the amount is far above this customer's average."* |
| Defaults found **after** the deadline | Borrower flagged **while there is still time** for a soft reminder or restructuring offer |
| Graph, model and audit in different places | **One console**: stream, graph, drivers, interventions, ledger |

Anyone, technical or not, can follow the loop: **see the alert** &rarr; **understand why** &rarr; **act** &rarr; **leave a record**.

<br/>

---

## 4. How the System Works

> From raw event to recorded decision, in eight stages.

```mermaid
flowchart TD
    IN["<b>1. INPUT</b><br/>Transaction event or<br/>daily borrower snapshot"]
    FEAT["<b>2. FEATURE ENGINEERING</b><br/>Velocity, amount z-score, device age,<br/>balance drop, ATM spike"]
    GRAPH["<b>3. GRAPH ENRICHMENT</b><br/>Neo4j: hops to nearest flagged<br/>account, bounded to 3"]
    MODEL["<b>4. MODEL SCORING</b><br/>Fraud: XGBoost via ONNX<br/>Distress: LightGBM"]
    DECIDE{"<b>5. DECISION</b><br/>Threshold bands"}
    EXPL["<b>6. EXPLANATION</b><br/>SHAP drivers +<br/>plain-language text"]
    ACT["<b>7. ACTION</b><br/>Approve / Flag / Block<br/>or distress playbook"]
    LOG["<b>8. AUDIT</b><br/>Append-only record in Postgres"]
    OUT["<b>ANALYST CONSOLE</b><br/>Live stream, graph, drivers, resolve"]
    FB["DEGRADED MODE<br/>rule-based fallback"]

    IN --> FEAT --> GRAPH --> MODEL --> DECIDE
    DECIDE --> EXPL --> ACT --> LOG --> OUT
    DECIDE -. "graph or model unavailable" .-> FB
    FB -.-> EXPL

    style IN fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style GRAPH fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style MODEL fill:#ffedd5,stroke:#c2410c,stroke-width:2px
    style DECIDE fill:#fef9c3,stroke:#a16207,stroke-width:2px
    style FB fill:#fee2e2,stroke:#b91c1c,stroke-width:2px
    style LOG fill:#ede9fe,stroke:#6d28d9,stroke-width:2px
    style OUT fill:#dcfce7,stroke:#15803d,stroke-width:2px
```

| # | Stage | What happens |
|:-:|---|---|
| **1** | **Input** | A transaction (amount, payee, device, IP, channel, time) or a borrower's 14-day cash-flow summary enters the system. |
| **2** | **Feature engineering** | Raw fields become model features: how unusual the amount is for this customer, burst velocity over 1 hour and 24 hours, new beneficiary, device age. For loans: balance drop %, ATM-withdrawal spike, new credit enquiries. Borrower features are cached in **Redis**. |
| **3** | **Graph enrichment** | Neo4j is asked for the shortest path (**max 3 hops**) from the accounts involved to any account marked as part of a fraud ring. The result becomes the `graph_hops` feature. If the graph cannot answer, it is marked unavailable and the response says **DEGRADED**. |
| **4** | **Scoring** | The fraud model outputs a probability. The distress model outputs a 0&ndash;100 score. |
| **5** | **Decision** | Fraud: **below 0.3 approve &middot; 0.3&ndash;0.7 flag &middot; above 0.7 block**. Distress: **LOW / MEDIUM / HIGH / CRITICAL** (0&ndash;39, 40&ndash;59, 60&ndash;74, 75&ndash;100). |
| **6** | **Explanation** | SHAP produces signed numeric contributions. The UI turns the real values into a short readable explanation. |
| **7** | **Action** | Analysts freeze escrow, challenge with OTP, or override with an audit stamp. |
| **8** | **Audit** | Every step is written to an append-only audit table. |

<br/>

---

## 5. System Architecture

> Only the major components, and the direction information flows between them.

```mermaid
flowchart LR
    subgraph UI["PRESENTATION"]
        FE["<b>Next.js 16 + React 19</b><br/>Analyst dashboard<br/>graph, stream, explanations"]
        EXP["<b>/api/explain</b><br/>server route"]
    end

    subgraph EDGE["EDGE"]
        GW["<b>API Gateway</b><br/>auth, tenancy, rate limits"]
    end

    subgraph CORE["INTELLIGENCE CORE"]
        ML["<b>FastAPI ML Service</b>"]
        ONNX["ONNX Runtime<br/>fraud-v1"]
        LGBM["LightGBM<br/>distress-v1"]
        SHAP["SHAP<br/>TreeExplainer"]
    end

    subgraph DATA["DATA LAYER"]
        NEO[("<b>Neo4j</b><br/>fraud graph")]
        RED[("<b>Redis</b><br/>borrower features")]
        PG[("<b>PostgreSQL 16</b><br/>transactions, scores,<br/>alerts, audit_log")]
    end

    subgraph EXT["EXTERNAL"]
        LLM["<b>OpenRouter LLM</b><br/>optional wording"]
    end

    FE -->|REST| GW
    GW -->|score request| ML
    ML --> ONNX
    ML --> LGBM
    ML --> SHAP
    ML <-->|hops, sync| NEO
    ML <-->|features| RED
    ML -->|persist, audit| PG
    FE --> EXP
    EXP -->|verified facts only| LLM

    style UI fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style EDGE fill:#fef9c3,stroke:#a16207,stroke-width:2px
    style CORE fill:#ffedd5,stroke:#c2410c,stroke-width:2px
    style DATA fill:#ede9fe,stroke:#6d28d9,stroke-width:2px
    style EXT fill:#f1f5f9,stroke:#475569,stroke-width:2px
```

| Component | Role |
|---|---|
| **Analyst dashboard** | Live ingestion stream, interactive fraud graph with zoom and pan, borrower register, ledger, interventions. |
| **API Gateway & workers** | Authentication, tenant isolation and asynchronous processing around the ML service (Node/TypeScript). |
| **FastAPI ML service** | One service that owns scoring, SHAP, graph sync, dashboard analytics and the resolve workflow. Structured JSON logs, a single consistent error format, and a readiness check that reports which models are loaded. |
| **Neo4j** | Stores accounts, devices and IPs with `TRANSACTED_WITH`, `SHARES_DEVICE`, `SHARES_IP` edges and a `fraudRingId` flag. Every query is **tenant-scoped**. |
| **Redis** | Borrower feature store (`borrower:{id}:features`, 25-hour TTL) so daily distress scoring avoids recomputation. |
| **PostgreSQL 16** | Multi-tenant source of truth. The app runs as a restricted role and **`audit_log` is append-only**, so records cannot be edited or deleted by the application. |
| **OpenRouter** | Optional: rewords an explanation, but only if **every number** in the reply exists in the supplied facts. |

<br/>

---

## 6. Core Features

> The capabilities that make the project worth a second look.

### 6.1 &nbsp;Graph-based mule-ring detection

A payment to a brand-new account looks harmless on its own. The graph reveals when that account shares a **device** or **IP** with a known mule.

```mermaid
graph LR
    V["Victim"] -->|pays| N["New payee"]
    N ---|SHARES_DEVICE| M1["mule-001<br/>ring flagged"]
    N ---|SHARES_IP| M2["mule-002<br/>ring flagged"]
    M1 ---|TRANSACTED_WITH| M3["mule-003<br/>ring flagged"]
    style M1 fill:#fde2e0,stroke:#c0392b,stroke-width:2px
    style M2 fill:#fde2e0,stroke:#c0392b,stroke-width:2px
    style M3 fill:#fde2e0,stroke:#c0392b,stroke-width:2px
    style N fill:#fff3cd,stroke:#b9770e,stroke-width:2px
```

> **Technically interesting:** hop distance is **bounded to 3** and encoded as a model feature (`4` = no connection, `-1` = graph unavailable), so the model behaves sensibly even during a graph outage.

### 6.2 &nbsp;Interactive graph: zoom, pan, reset

Inspect dense clusters without losing context.

| Control | Action |
|---|---|
| **+ / &minus; buttons** | Zoom between 60% and 400% |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + scroll | Zoom toward the cursor |
| **Drag** the background | Pan when zoomed in |
| <kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd> | Keyboard zoom and reset |
| **Double-click** | Reset the view |

Clicking a node still opens the forensic inspector.

### 6.3 &nbsp;Early loan-distress warning

<div align="center">
<img src="docs/assets/dashboard-loan-distress.png" alt="Loan distress dashboard" width="90%"/>
<br/><sub><i>Pre-default credit register</i></sub>
</div>

<br/>

A borrower with an **&minus;82% 14-day cash drop** and a **4&times; ATM spike** is surfaced weeks before the EMI date, with a graduated playbook:

**Soft reminder** &rarr; **Moratorium offer** &rarr; **Credit-officer consultation**

### 6.4 &nbsp;Plain-language explanations with verified numbers

| Raw output | Explanation shown beside it |
|---|---|
| `Fraud Risk: 87/100` | *"Fraud risk is 87/100 (HIGH) and the status is BLOCKED. The score was pushed up by ..."* followed by the real figures. |
| `Distress: 78/100` | *"Loan distress score is 78/100: cash reserves fell 82% over 14 days and ATM withdrawals rose 4&times;."* |

The numbers **stay visible**. The text only explains them.

### 6.5 &nbsp;Honest degradation

If the graph or model cannot answer, the system says so (**DEGRADED**, *"No valid score available"*) and falls back to its rule-based calculation, labelled **RULE-BASED SCORE** instead of **ML MODEL SCORE**.

### 6.6 &nbsp;Accountable resolve workflow

Analysts can **freeze escrow**, **challenge via OTP**, or **override with an audit stamp**. Alerts follow a state machine and each transition is permanently logged.

<br/>

---

## 7. AI / ML / Intelligence

> Tabular ML for the scores, a graph for context, SHAP for the "why", and guardrails around any language model.

### 7.1 &nbsp;Model pipeline

```mermaid
flowchart LR
    A["<b>Synthetic data</b><br/>~30k events, seed 42<br/>~1.8% fraud"] --> B["<b>10 fraud features</b><br/>fixed order and version"]
    B --> C["<b>XGBoost</b><br/>depth 4, early stopping,<br/>class-weighted"]
    C --> D["<b>Export to ONNX</b><br/>parity checked"]
    D --> E["<b>ONNX Runtime</b><br/>serving"]
    E --> F["<b>Thresholds</b><br/>0.3 flag, 0.7 block"]
    F --> G["<b>SHAP drivers</b><br/>separate endpoint"]
    G --> H["<b>Result + audit</b>"]
    style C fill:#ffedd5,stroke:#c2410c,stroke-width:2px
    style D fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style G fill:#fce7f3,stroke:#be185d,stroke-width:2px
```

| Model | Task | Why this choice |
|---|---|---|
| **XGBoost &rarr; ONNX** (`fraud-v1`) | Transaction fraud probability | Strong on tabular, imbalanced data. ONNX gives lean, language-neutral serving. The exported model matches the original within **4.8 &times; 10<sup>-7</sup>** max absolute difference. |
| **LightGBM** (`distress-v1`) | Borrower distress score 0&ndash;100 | Fast and accurate on a handful of cash-flow features (30/60-day balances, balance drop, ATM spike, new credit count). |
| **SHAP TreeExplainer** | Signed feature contributions | Shows **which** inputs moved the score and by how much. Returns **numbers only**; wording is a separate step. |
| **Graph features** | `graph_hops` | Captures network context that single-transaction features cannot. |

### 7.2 &nbsp;The explanation layer and its safeguards

```mermaid
flowchart TD
    R["Model or rule-based result<br/>score, metrics, drivers"] --> F["<b>Build FACTS</b><br/>only values already on the result"]
    F --> V{"Valid score?"}
    V -- "No" --> T0["Template:<br/>No valid score available"]
    V -- "Yes" --> K{"LLM key configured?"}
    K -- "No" --> T["Deterministic template"]
    K -- "Yes" --> L["<b>LLM rewrites facts</b><br/>temp 0.2, 8s timeout"]
    L --> C{"Every number in the reply<br/>exists in the facts?"}
    C -- "Yes" --> OK["Shown as<br/><b>AI, numbers verified</b>"]
    C -- "No, error or timeout" --> T
    style OK fill:#dcfce7,stroke:#15803d,stroke-width:2px
    style T fill:#e0f2fe,stroke:#0369a1,stroke-width:2px
    style T0 fill:#fee2e2,stroke:#b91c1c,stroke-width:2px
    style C fill:#fef9c3,stroke:#a16207,stroke-width:2px
```

**Safeguards**

- **No free-form prompts** from the browser; only structured facts are accepted.
- **Strict number whitelist:** a reply containing any number not in the facts is rejected.
- **Length cap**, plus instant template text shown first and upgraded only if the LLM reply passes.
- The underlying ML and heuristic logic is **never altered** by this layer.

### 7.3 &nbsp;Evaluation (synthetic only)

Training and the held-out test split are generated by the same simulator, so the figures show that the pipeline works, **not** that it would detect real fraud. Measured values are in [Section 9](#9-results-impact--demonstration).

<br/>

---

## 8. User Experience / Real-World Workflow

> **Scenario:** a scam-ring attack hits an account.

```mermaid
sequenceDiagram
    autonumber
    actor Victim as Customer
    participant Bank as Core banking
    participant Aedis as Aedis ML service
    participant Graph as Neo4j
    actor Analyst as Risk analyst

    Victim->>Bank: Transfers a large amount to a new payee
    Bank->>Aedis: Transaction event
    Aedis->>Graph: How close is this payee to flagged accounts?
    Graph-->>Aedis: 1 hop to mule ring
    Aedis->>Aedis: Score (e.g. 87/100) + SHAP drivers
    Aedis-->>Analyst: BLOCKED alert with explanation and graph
    Analyst->>Aedis: Freeze escrow / challenge OTP / override with stamp
    Aedis->>Aedis: Write audit record (append-only)
    Aedis-->>Victim: Funds protected, reason on record
```

| Step | User goal | What they see | Benefit |
|:-:|---|---|---|
| **1** | Watch for suspicious activity | **Live Ingestion Stream** with risk filters (CRITICAL / HIGH / MEDIUM / LOW) | One screen for everything arriving now |
| **2** | Understand an alert | **"Why is this transaction risky?"** with the score, the scale and the real contributing figures | Decide in seconds, no guesswork |
| **3** | See the network | Interactive graph; click any node for the forensic inspector; zoom into a cluster | Spot the ring, not just the payment |
| **4** | Act | `[1. FREEZE ESCROW]` &middot; `[2. CHALLENGE OTP]` &middot; `[3. OVERRIDE & APPROVE WITH AUDIT STAMP]` | Proportionate response, always recorded |
| **5** | Credit view | Pre-default register with EMI, 14-day cash drop and ATM spike | Reach out **before** the missed payment |
| **6** | Audit | Immutable regulatory ledger with log IDs, actors and actions | Ready for compliance review |

The console is organised into five areas: **Fraud & Mule Sentinel** &middot; **Loan Default Distress** &middot; **Dual-Score Explainability** &middot; **Microservices Telemetry** &middot; **Risk DNA Simulator** (an interactive sandbox to test how inputs change a score).

<br/>

---

## 9. Results, Impact & Demonstration

> [!WARNING]
> All figures below come from a **SYNTHETIC** test split (the last 15% of simulated events, by time). They are read directly from the trained models' metadata, not estimated, and they do **not** represent real-bank performance.

### 9.1 &nbsp;Fraud model: `fraud-v1`

<sub>4,503 test rows, 102 fraud cases</sub>

<table>
  <tr>
    <th align="center">PR-AUC</th>
    <th align="center">Recall @ flag (0.3)</th>
    <th align="center">Precision @ flag</th>
    <th align="center">Precision @ block (0.7)</th>
    <th align="center">Recall @ block</th>
  </tr>
  <tr>
    <td align="center"><h3>0.971</h3></td>
    <td align="center"><h3>98.0%</h3></td>
    <td align="center"><h3>69.9%</h3></td>
    <td align="center"><h3>86.2%</h3></td>
    <td align="center"><h3>92.2%</h3></td>
  </tr>
</table>

```mermaid
xychart-beta
    title "Fraud recall by simulated attack type (flag threshold 0.3)"
    x-axis ["High value", "Micro-burst", "New payee at night", "Mule ring"]
    y-axis "Recall (%)" 0 --> 100
    bar [100, 100, 100, 88.2]
```

| Confusion matrix @ flag (0.3) | Predicted legit | Predicted fraud |
|---|:-:|:-:|
| **Actually legit** | 4,358 | 43 |
| **Actually fraud** | 2 | 100 |

The model deliberately favours **catching** fraud at the flag stage (only 2 of 102 missed) and tightens up at the block stage, where precision rises to **86%**.

### 9.2 &nbsp;Distress model: `distress-v1`

<sub>900 test rows</sub>

<table>
  <tr>
    <th align="center">ROC-AUC</th>
    <th align="center">PR-AUC</th>
    <th align="center">Precision @ 0.5</th>
    <th align="center">Recall @ 0.5</th>
  </tr>
  <tr>
    <td align="center"><h3>0.836</h3></td>
    <td align="center"><h3>0.515</h3></td>
    <td align="center"><h3>59.2%</h3></td>
    <td align="center"><h3>60.9%</h3></td>
  </tr>
</table>

A modest, realistic result for a small five-feature model. That is why the distress output is framed as an **early-warning signal with human follow-up**, not an automatic decision.

### 9.3 &nbsp;Engineering results

| Item | Result |
|---|---|
| **Automated tests** | **204 passing**, including an end-to-end flow against live Postgres, Redis and Neo4j |
| **ONNX export fidelity** | Max difference **4.8 &times; 10<sup>-7</sup>** vs. the original XGBoost model |
| **Explanation guardrails** | Tested against a fake LLM: a valid reply is accepted; a reply with an invented number is rejected; server down, missing key and null score all fall back cleanly |
| **Latency** | The UI shows demo figures (for example 38.4 ms) that are **illustrative mock data**. A sub-50 ms target is a design goal and **has not been benchmarked yet**. |

### 9.4 &nbsp;Input &rarr; output examples

| Input | Output |
|---|---|
| Transaction `TX-SEC-9042`: large transfer, receiving account linked to the "Alpha Mule" cluster | **87/100, BLOCKED**, with a readable reason and the figures behind it |
| Borrower `LN-COMM-418-FACILITY`: &minus;82% cash in 14 days, ATM 4&times; normal, EMI $18,400 | **Distress 78/100**, recommended action: 3-month moratorium offer via WhatsApp/SMS |

<br/>

---

## 10. Technology Stack & Project Showcase

> The tools behind the platform, grouped by layer.

| Layer | Technologies |
|---|---|
| **Frontend** | ![Next.js](https://img.shields.io/badge/Next.js_16-000?style=flat-square&logo=nextdotjs&logoColor=white) ![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![Tailwind](https://img.shields.io/badge/Tailwind_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) |
| **ML service** | ![Python](https://img.shields.io/badge/Python_3.11-3776AB?style=flat-square&logo=python&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white) ![uv](https://img.shields.io/badge/uv-DE5FE9?style=flat-square) |
| **AI / ML** | ![XGBoost](https://img.shields.io/badge/XGBoost-EC6B23?style=flat-square) ![ONNX](https://img.shields.io/badge/ONNX_Runtime-005CED?style=flat-square&logo=onnx&logoColor=white) ![LightGBM](https://img.shields.io/badge/LightGBM-2E8B57?style=flat-square) ![SHAP](https://img.shields.io/badge/SHAP-FF0051?style=flat-square) ![OpenRouter](https://img.shields.io/badge/OpenRouter-6467F2?style=flat-square) |
| **Data** | ![Neo4j](https://img.shields.io/badge/Neo4j-008CC1?style=flat-square&logo=neo4j&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white) ![Alembic](https://img.shields.io/badge/Alembic-migrations-555?style=flat-square) |
| **Infrastructure** | ![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?style=flat-square&logo=docker&logoColor=white) |

### Showcase

<table>
  <tr>
    <th align="center">Fraud &amp; Mule Sentinel</th>
    <th align="center">Loan Default Distress</th>
  </tr>
  <tr>
    <td><img src="docs/assets/dashboard-fraud-sentinel.png" alt="Fraud Sentinel"/></td>
    <td><img src="docs/assets/dashboard-loan-distress.png" alt="Loan Distress"/></td>
  </tr>
</table>

### Links

| | |
|---|---|
| **Repository** | [github.com/MawiyaManzar/Aedis_Smart_assistant](https://github.com/MawiyaManzar/Aedis_Smart_assistant) |
| **Event** | **Consilium '26 &middot; FINTECHSTICO**, organised by the Finance & Economics Society (FES), NSUT Delhi |

### Why it is technically valuable

> Aedis combines **graph context**, **tabular machine learning** and **honest, verifiable explanations** in one auditable platform.
>
> Its distinguishing choices are the ones that matter in finance: a **bounded and observable graph signal**, an **explicit degraded state** instead of silent failure, an explanation layer that **cannot introduce a number the model did not produce**, and an **append-only audit trail** behind every action.
>
> It is a hackathon prototype on synthetic data, built so that each of those ideas can be tested, measured and trusted before it meets real data.

<br/>

<div align="center">

**Aedis Smart Assistant &middot; FINTECHSTICO '26**

*Connected. Explainable. Accountable.*

</div>
