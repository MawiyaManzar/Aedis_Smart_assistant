# Developer 1 demo scenarios

Two deterministic scripts drive the **running** ML service over HTTP. They print only values the service, Postgres, Redis or Neo4j actually returned. All data is synthetic: nothing here describes real-bank performance, and the models were trained on synthetic data (see `model-card-fraud.md`).

Scripts live in `services/ml-service/scripts/`. Ids come from `uuid5`, timestamps are fixed offsets from `2026-02-01T00:00Z`, and amounts use a fixed RNG seed, so every run sends identical requests. Both are re-runnable.

## Prerequisites

```powershell
cd C:\dev\NSUT
docker compose up -d                      # postgres, redis, neo4j, ml-service
cd services\ml-service
uv sync
```

The service image must be current (it needs `POST /v1/transactions/score` and the loaded `distress-v1` artifact). Check:

```powershell
Invoke-RestMethod http://localhost:8000/health/ready
```

`models[]` must list `fraud` and `distress` with `loaded: true`. If the container is older than the working tree, rebuild (`docker compose up -d --build ml-service`) or run the current code locally on another port and pass that URL to the scripts:

```powershell
uv run uvicorn app.main:app --port 8001
```

The scripts read the repo-root `.env` for any variable that is not already set (`MIGRATION_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`, `NEO4J_*`). Base URL: first argument, else `AEDIS_ML_URL`, else `http://localhost:8000`.

## 1. Scam-ring demo

```powershell
uv run python scripts/demo_scam_ring.py                       # default base URL
uv run python scripts/demo_scam_ring.py http://localhost:8001 # explicit base URL
```

What it does:

1. Inserts the dedicated demo tenant `00000000-0000-4000-8000-0000000000d1` (`ON CONFLICT DO NOTHING`; `scripts/demo_common.py:DEMO_TENANT_ID`). Both demos use it, **not** the shared graph seed tenant `...0a1` (`app.graph.seed.SEED_TENANT_ID`), so demo accounts (`victim-*`, `merchant-*`) never alter the seed tenant's invariants that integration tests and the integration guide rely on.
2. Calls `apply_seed(client, DEMO_TENANT_ID)`: syncs the seed graph into the demo tenant and sets `fraudRingId = ring-seed-001` on its `mule-001`, `mule-002`, `mule-003`.
3. Replays 36 normal transfers (12 for each of `victim-001..003`, days 1-20 before the attack day) through `POST /v1/transactions/score`.
4. Scores, per victim, one ordinary payment to a known merchant (control) and two 03:xx transfers into ring accounts from the ring's device and IP.
5. For each probe prints status, probability, graph status and hops (read from `fraud_events.graph_hops`, since the HTTP response does not carry it), ring ids, suspicious accounts and the numeric SHAP drivers.

Expected shape (values come from the service; none are fixed here):

```text
tenant <uuid> ready; seed graph applied (<n> events), ring ring-seed-001 accounts flagged: mule-001, mule-002, mule-003
replayed 36 synthetic history transactions for 3 victims

victim-001: ordinary payment to a known merchant (control)
  amount=<..> at <iso timestamp>
  status=<APPROVED|FLAGGED|BLOCKED> fraud_probability=<0..1> graph_status=<OK|DEGRADED> graph_hops=<-1..4>
  fraud_ring_ids=[...] suspicious_accounts=[...] graph_synced=<bool>
  top_drivers=[] (SHAP is only computed for FLAGGED/BLOCKED)      # or, when flagged/blocked:
  driver <feature>=<value> shap=<signed log-odds>                 # one line per driver
  model=<model_version> service_latency_ms=<ms>
... (9 probes in total)
Synthetic data only: these numbers do not describe real-bank performance.
```

A re-run re-scores the same transaction ids: history rows and the graph do not duplicate, and `fraud_events` is upserted per (transaction, model version).

## 2. Loan-distress demo

```powershell
uv run python scripts/demo_loan_distress.py
```

What it does: builds 4 `healthy` and 4 `deteriorating` synthetic borrowers (aggregates -> `build_distress_features`), writes them to the Redis `BorrowerFeatureStore`, reads them back and checks equality, posts them to `POST /v1/models/distress/score-batch`, and inserts one `loan_distress_scores` row each through `DistressScoreRepository` (skipped when a row for the same borrower, model version and evaluation time exists, so re-runs do not duplicate).

Expected shape:

```text
wrote 8 borrower feature hashes to Redis and read them back identically
model=<model_version> feature_version=<..> evaluation_date=2026-02-01 inference_latency_ms=<ms>
persisted <n> new loan_distress_scores rows (<8-n> already present)
borrower          profile         drop%  atm_spike  new_credit  score  band
healthy-01        healthy          <..>       <..>        <..>   <0-100>  <LOW|MEDIUM|HIGH|CRITICAL>
...
deteriorating-04  deteriorating    <..>       <..>        <..>   <0-100>  <band>
```

Bands: 0-39 LOW, 40-59 MEDIUM, 60-74 HIGH, 75-100 CRITICAL. Whether the deteriorating profiles land in a higher band than the healthy ones is something you read from the output; it is not asserted by the script.

## Failure behaviour

Both scripts exit non-zero with a one-line `ERROR:` message on stderr:

| Exit | Meaning |
| --- | --- |
| 2 | ML service unreachable (`/health` does not answer) |
| 3 | Service answered a scoring call with a non-200 (the error body is printed; e.g. 404 from an out-of-date container, 503 `MODEL_NOT_LOADED`) |
| 4 | Postgres, Redis or Neo4j unavailable |

## Tests without the stack

```powershell
uv run pytest -q tests/test_demo_scenarios.py
```

Exercises the pure scenario builders (determinism, id uniqueness, time ordering, request shapes). It needs no services.
