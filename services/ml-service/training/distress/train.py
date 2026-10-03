"""Train the LightGBM loan-distress model on SYNTHETIC borrowers.

    uv run python -m training.distress.train

Labels come from a simulated latent-distress process, so metrics describe the simulator only.
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import lightgbm as lgb
import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score

from app.core.config import SERVICE_ROOT
from app.features.distress import (
    DISTRESS_FEATURE_ORDER,
    DISTRESS_FEATURE_VERSION,
    build_distress_features,
    to_vector,
)
from app.schemas.features import DistressFeatureSource

logger = logging.getLogger(__name__)
MODEL_NAME = "distress"
MODEL_VERSION = "distress-v1"
PARAMS: dict[str, Any] = {
    "objective": "binary",
    "learning_rate": 0.05,
    "num_leaves": 15,
    "min_data_in_leaf": 20,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.9,
    "bagging_freq": 1,
    "num_threads": 1,
    "deterministic": True,
    "force_row_wise": True,
    "verbosity": -1,
}


def generate(seed: int, n: int = 6000) -> tuple[np.ndarray, np.ndarray]:
    """Latent distress d~Bernoulli; distressed borrowers drain balances, spike ATM use and open
    high-interest credit. 15% of borrowers are 'noisy' (behave like the other class)."""
    rng = np.random.default_rng(seed)
    y = (rng.random(n) < 0.18).astype(int)
    flip = rng.random(n) < 0.15
    state = np.where(flip, 1 - y, y)  # observable behaviour state
    rows = []
    for s in state:
        base = float(np.exp(rng.normal(8.0, 0.6)))
        avg60 = base * float(rng.uniform(0.9, 1.1))
        decay = rng.uniform(0.35, 0.8) if s else rng.uniform(0.9, 1.15)
        avg30 = avg60 * float(decay)
        atm28 = float(rng.uniform(200, 900))
        atm14 = atm28 / 2 * float(rng.uniform(1.6, 3.5) if s else rng.uniform(0.7, 1.3))
        credits = int(rng.poisson(1.8 if s else 0.25))
        src = DistressFeatureSource(
            borrower_id=uuid4(),
            avg_balance_30d=avg30,
            avg_balance_60d=avg60,
            atm_14d=atm14,
            atm_28d=atm28,
            new_high_interest_count=credits,
        )
        rows.append(to_vector(build_distress_features(src)))
    return np.asarray(rows, dtype=np.float64), y


def train(seed: int = 42) -> tuple[lgb.Booster, dict[str, Any]]:
    x, y = generate(seed)
    n = len(y)
    a, b = int(n * 0.7), int(n * 0.85)
    train_set = lgb.Dataset(x[:a], y[:a], feature_name=list(DISTRESS_FEATURE_ORDER))
    valid_set = lgb.Dataset(x[a:b], y[a:b], reference=train_set)
    booster = lgb.train(
        {**PARAMS, "seed": seed},
        train_set,
        num_boost_round=400,
        valid_sets=[valid_set],
        callbacks=[lgb.early_stopping(30, verbose=False)],
    )
    p = booster.predict(x[b:], num_iteration=booster.best_iteration)
    pred = np.asarray(p) >= 0.5
    yt = y[b:]
    tp = int((pred & (yt == 1)).sum())
    metrics = {
        "evaluation_data": "SYNTHETIC test split (last 15%). Not real-world performance.",
        "rows": int(len(yt)),
        "positive_rate": float(yt.mean()),
        "roc_auc": float(roc_auc_score(yt, p)),
        "pr_auc": float(average_precision_score(yt, p)),
        "precision_at_0.5": tp / max(int(pred.sum()), 1),
        "recall_at_0.5": tp / max(int(yt.sum()), 1),
        "best_iteration": int(booster.best_iteration),
    }
    return booster, metrics


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=SERVICE_ROOT / "artifacts")
    args = parser.parse_args()
    booster, metrics = train(args.seed)
    directory = args.out / MODEL_NAME / MODEL_VERSION
    directory.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(directory / "model.txt"), num_iteration=booster.best_iteration)
    metadata = {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "feature_version": DISTRESS_FEATURE_VERSION,
        "feature_list": list(DISTRESS_FEATURE_ORDER),
        "weights_file": "model.txt",
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "data_source": "synthetic",
        "data_seed": args.seed,
        "lightgbm_version": lgb.__version__,
        "params": PARAMS,
        "score_definition": "round(100 * P(distress)); bands 0-39 LOW, 40-59 MEDIUM, 60-74 HIGH, "
        "75-100 CRITICAL",
        "metrics": metrics,
    }
    (directory / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    logger.info("wrote %s", directory)
    logger.info("SYNTHETIC: %s", json.dumps(metrics))


if __name__ == "__main__":
    main()
