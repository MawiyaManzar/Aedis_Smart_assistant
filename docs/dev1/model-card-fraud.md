# Model card: `fraud-v1` (XGBoost)

**Status: prototype trained on SYNTHETIC data.** Nothing here reflects real-bank performance.

| Item | Value |
|---|---|
| Model | XGBoost binary classifier (`XGBClassifier`, hist, depth 4, 400 trees max, early stopping) |
| Feature set | `fraud-features-v1` (10 features, order fixed; see `fraud-features.md`) |
| Data | Deterministic simulator in `services/ml-service/training/fraud/data.py` (seed 42, ~30k events, ~1.8% fraud) |
| Split | Chronological 70 / 15 / 15 (train / validation for early stopping / test) |
| Imbalance | `scale_pos_weight` = negatives / positives in the train split |
| Reproduce | `cd services/ml-service && uv run python -m training.fraud.train` |
| Artifact | `services/ml-service/artifacts/fraud/fraud-v1/{model.json,metadata.json}` |

## Simulated scenarios
Normal traffic; legitimate large payments (hard negatives, 1%); high-value anomaly; night-time
new-payee transfer; micro-transfer burst then large transfer; mule rings (6 rings, 4 flagged in
the graph, 2 unknown). About 5% of rows have `graph_hops = -1` to simulate a graph outage.

## Measured results (synthetic test split, last 15% by time)
The authoritative numbers (precision, recall, F1, PR-AUC, confusion matrix, per-scenario recall at
both thresholds) are written into `metadata.json` by every training run. Read them there rather
than from this document.

## Limitations
- The simulator defines both the attacks and the labels, so the model can learn simulator
  artifacts. High scores here do not transfer to real fraud.
- Fraud labels depend on feature design; the mule-ring signal depends on the graph already knowing
  some flagged accounts.
- No calibration beyond XGBoost's logistic output; thresholds (0.3 / 0.7) come from the product
  spec and are not tuned.
- Not evaluated for fairness, drift, or adversarial robustness.
