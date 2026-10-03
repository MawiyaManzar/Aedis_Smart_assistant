# Distress feature definitions (`distress-features-v1`)

Source of truth: `services/ml-service/app/features/distress.py`. `build_distress_features(DistressFeatureSource) -> DistressFeatures` is pure and is the only supported place to derive these values. Training data, the demo borrowers and the model are **synthetic**; nothing here claims real-bank performance.

Inputs (`DistressFeatureSource`, the aggregates named by the architecture's per-borrower SQL): `avg_balance_30d`, `avg_balance_60d`, `atm_14d`, `atm_28d`, `new_high_interest_count`.

| Feature | Definition | Range / notes |
| --- | --- | --- |
| `avg_balance_30d` | Passed through | 30-day average balance |
| `avg_balance_60d` | Passed through | 60-day average balance |
| `balance_drop_pct` | `100 * (avg_balance_60d - avg_balance_30d) / max(avg_balance_60d, 1)` | Clipped to [-100, 100]. Positive means balances are falling. |
| `atm_spike_ratio` | `atm_14d / max(atm_28d / 2, 1)` | Clipped to [0, 20]. 1.0 means the recent 14 days match the average 14-day rate over 28 days. |
| `new_credit_count` | `new_high_interest_count` | Integer >= 0 |

Model input order is `DISTRESS_FEATURE_ORDER` (the field order of `DistressFeatures`): `avg_balance_30d, avg_balance_60d, balance_drop_pct, atm_spike_ratio, new_credit_count`. Feature version string: `distress-features-v1`.

The Redis `BorrowerFeatureStore` (`app/featurestore/borrower.py`) keeps these five values plus `computed_at` in hash `borrower:{borrower_id}:features` with a 25 hour TTL (`FEATURE_TTL_SECONDS = 90000`). Missing or expired borrowers are omitted from `get_many`.

Risk bands applied to the 0-100 score: 0-39 LOW, 40-59 MEDIUM, 60-74 HIGH, 75-100 CRITICAL (`app/inference/risk_mapping.py`).

See `demo.md` for a runnable healthy-vs-deteriorating example.
