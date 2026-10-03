# Fraud feature definitions (feature version `fraud-features-v1`)

Implemented in `services/ml-service/app/features/` and shared by training and serving. Pure functions live in `fraud_features.py`; `FraudFeatureBuilder` in `fraud.py` is the only place a transaction becomes a model input. Constants are in `config.py`.

Model input order (`FRAUD_FEATURE_ORDER`): `amount_zscore, velocity_1h, velocity_24h, graph_hops, is_new_beneficiary, device_age_days, ip_country_risk, hour_of_day, day_of_week, channel_risk_score`. The architecture mentions 20 features and a `docs/features/fraud_v1.md` that does not exist in the repository; this version implements the ten features named in the task and no others.

## History contract and leakage rules

The builder asks a `HistoryProvider` for the sender's outgoing transactions in `[t - 90d, t)` where `t` is the event timestamp. The feature functions then **re-filter** to rows strictly before `t` and exclude the event's own `transactionId`, so a provider that returns future rows (or the event itself) cannot leak information. Timestamps are normalised to UTC on input (naive timestamps are treated as UTC). History is tenant-scoped.

## Behavioral baseline (exactly)

For `amount_zscore` the baseline is the sender's own outgoing amounts with `occurred_at` in `[t - 30d, t)`, ignoring non-finite values.

- If fewer than `baseline_min_history = 5` amounts exist: value `0.0` and flag `baseline_insufficient`. This means "no evidence of abnormality", not "verified normal".
- Otherwise `z = (amount - mean) / scale`, `mean` = arithmetic mean, sample standard deviation (n-1), and `scale = max(std, 0.05 * |mean|, 1.0)`. The floor stops near-constant histories from exploding the score.
- `z` is clipped to `[-10, 10]`.

## Features

| Feature | Meaning | Missing / edge behaviour |
| --- | --- | --- |
| `amount_zscore` | Standardised distance of this amount from the sender's 30-day baseline | `0.0` + `baseline_insufficient` |
| `velocity_1h` | Sender's outgoing transactions in `[t-1h, t)`, excluding this one | `0` with no history |
| `velocity_24h` | Same over 24 hours | `0` |
| `graph_hops` | `0` sender is in a flagged ring; `1..3` shortest relationship path to a flagged account; `4` none within 3 hops; `-1` graph lookup unavailable | `None` input becomes `-1` + `graph_unavailable`. It is never replaced by a "safe" value |
| `is_new_beneficiary` | No payment from the sender to this beneficiary in the 90-day lookback | New when no history |
| `device_age_days` | Days from the device's first recorded use (tenant-wide) to `t` | First use, unknown, or no device: `0.0` (`device_missing` flag if no device id) |
| `ip_country_risk` | Risk of the IP's CIDR block from a static table, in `[0, 1]` | Missing/invalid IP: `0.5` + `ip_missing`. Valid but unlisted: `0.3` |
| `hour_of_day` | UTC hour `0-23` | none |
| `day_of_week` | UTC, Monday `0` to Sunday `6` | none |
| `channel_risk_score` | Static prior per channel (`branch 0.1, mobile 0.3, web 0.4, atm 0.6`) | Unknown channel: `0.5` + `channel_unknown` |

## Honest limits

- `ip_country_risk` has no geo-IP database behind it. The table covers documentation and private ranges so the demo is reproducible. Its values, and the channel priors, are demo priors, not calibrated risk estimates.
- Beneficiaries last paid more than 90 days ago count as new.
- The unusually-large-amount signal depends on 5 prior transactions. New accounts get `0.0` and a flag; the model must not be read as having verified them.
- `graph_hops = -1` is a real input value. Training data deliberately includes a share of `-1` rows (simulated graph outages) so the model has seen it. The score route still reports the degraded graph status to the caller.
