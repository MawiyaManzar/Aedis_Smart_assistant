"""Train the XGBoost fraud classifier on SYNTHETIC data and write the model artifact.

    uv run python -m training.fraud.train                # writes artifacts/fraud/fraud-v1/
    uv run python -m training.fraud.train --seed 7 --out /tmp/artifacts

Metrics describe performance on simulated attack patterns only. They are not an estimate of
real-world bank performance and must not be presented as one.
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import xgboost as xgb
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

from app.core.config import SERVICE_ROOT
from app.features.fraud import FRAUD_FEATURE_ORDER, FraudFeatureBuilder, to_vector
from app.features.history import InMemoryHistoryProvider
from training.fraud.data import LabeledEvent, generate
from training.fraud.export_onnx import PARITY_TOLERANCE, check_parity, export_onnx

logger = logging.getLogger(__name__)

MODEL_NAME = "fraud"
MODEL_VERSION = "fraud-v1"
FEATURE_VERSION = "fraud-features-v1"
FLAG_THRESHOLD = 0.3  # architecture: >= 0.3 FLAGGED
BLOCK_THRESHOLD = 0.7  # architecture: > 0.7 BLOCKED
TRAIN_FRACTION = 0.70
VALID_FRACTION = 0.15

XGB_PARAMS: dict[str, Any] = {
    "n_estimators": 400,
    "max_depth": 4,
    "learning_rate": 0.06,
    "subsample": 0.9,
    "colsample_bytree": 0.9,
    "min_child_weight": 2,
    "reg_lambda": 1.0,
    "tree_method": "hist",
    "eval_metric": "aucpr",
    "early_stopping_rounds": 30,
    "n_jobs": 1,  # single thread keeps training bit-for-bit reproducible
}


@dataclass(frozen=True)
class Dataset:
    x: np.ndarray
    y: np.ndarray
    scenario: np.ndarray
    timestamp: np.ndarray


def build_dataset(labeled: list[LabeledEvent]) -> Dataset:
    """Run the *production* feature builder over time-ordered events (history = past only)."""
    builder = FraudFeatureBuilder()
    history = InMemoryHistoryProvider()
    rows: list[list[float]] = []
    for item in labeled:
        result = builder.build(item.event, history, graph_hops=item.graph_hops)
        rows.append(to_vector(result.features))
        history.add(item.event)  # added only after its own features are computed
    return Dataset(
        x=np.asarray(rows, dtype=np.float32),
        y=np.asarray([item.label for item in labeled], dtype=np.int32),
        scenario=np.asarray([item.scenario for item in labeled]),
        timestamp=np.asarray([item.event.timestamp.isoformat() for item in labeled]),
    )


def time_split(n: int) -> tuple[slice, slice, slice]:
    """Chronological split. Data is already ordered by time, so later rows are never trained on."""
    train_end = int(n * TRAIN_FRACTION)
    valid_end = int(n * (TRAIN_FRACTION + VALID_FRACTION))
    return slice(0, train_end), slice(train_end, valid_end), slice(valid_end, n)


def _threshold_metrics(y: np.ndarray, probability: np.ndarray, threshold: float) -> dict[str, Any]:
    predicted = (probability >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    return {
        "threshold": threshold,
        "precision": float(precision_score(y, predicted, zero_division=0)),
        "recall": float(recall_score(y, predicted, zero_division=0)),
        "f1": float(f1_score(y, predicted, zero_division=0)),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
    }


def evaluate(y: np.ndarray, probability: np.ndarray, scenario: np.ndarray) -> dict[str, Any]:
    per_scenario = {}
    for name in sorted(set(scenario.tolist())):
        mask = scenario == name
        positives = int(y[mask].sum())
        if positives:
            caught = int(((probability >= FLAG_THRESHOLD) & mask & (y == 1)).sum())
            per_scenario[name] = {
                "positives": positives,
                "recall_at_flag_threshold": caught / positives,
            }
    return {
        "rows": int(len(y)),
        "positives": int(y.sum()),
        "positive_rate": float(y.mean()),
        "pr_auc": float(average_precision_score(y, probability)),
        "at_flag_threshold": _threshold_metrics(y, probability, FLAG_THRESHOLD),
        "at_block_threshold": _threshold_metrics(y, probability, BLOCK_THRESHOLD),
        "per_scenario": per_scenario,
    }


def train(seed: int = 42) -> tuple[xgb.XGBClassifier, dict[str, Any], Dataset]:
    labeled = generate(seed=seed)
    data = build_dataset(labeled)
    train_s, valid_s, test_s = time_split(len(data.y))
    for name, part in (("train", train_s), ("valid", valid_s), ("test", test_s)):
        if data.y[part].sum() == 0:
            raise RuntimeError(f"{name} split has no positive examples")

    negatives = int((data.y[train_s] == 0).sum())
    positives = int(data.y[train_s].sum())
    scale_pos_weight = negatives / positives
    model = xgb.XGBClassifier(**XGB_PARAMS, scale_pos_weight=scale_pos_weight, random_state=seed)
    model.fit(
        data.x[train_s],
        data.y[train_s],
        eval_set=[(data.x[valid_s], data.y[valid_s])],
        verbose=False,
    )
    test_probability = model.predict_proba(data.x[test_s])[:, 1]
    metrics = {
        "evaluation_data": "SYNTHETIC test split (last 15% by time). Not real-world performance.",
        "test": evaluate(data.y[test_s], test_probability, data.scenario[test_s]),
        "train_rows": int(train_s.stop - train_s.start),
        "valid_rows": int(valid_s.stop - valid_s.start),
        "scale_pos_weight": scale_pos_weight,
        "best_iteration": int(model.best_iteration),
    }
    return model, metrics, data


def write_artifact(
    model: xgb.XGBClassifier, metrics: dict[str, Any], data: Dataset, seed: int, out: Path
) -> Path:
    directory = out / MODEL_NAME / MODEL_VERSION
    directory.mkdir(parents=True, exist_ok=True)
    # Early stopping keeps trailing trees after the best iteration; predict_proba (and the ONNX
    # export) ignore them, so drop them to keep model.json (used by SHAP) identical to serving.
    model.get_booster()[: int(model.best_iteration) + 1].save_model(directory / "model.json")
    onnx_path = export_onnx(model, directory)
    parity = check_parity(model, onnx_path, data.x[time_split(len(data.y))[2]])
    if parity > PARITY_TOLERANCE:
        raise RuntimeError(f"ONNX parity check failed: max |diff| {parity:.2e}")
    metadata = {
        "onnx_file": onnx_path.name,
        "onnx_parity_max_abs_diff": parity,
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "feature_version": FEATURE_VERSION,
        "feature_list": list(FRAUD_FEATURE_ORDER),
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "data_source": "synthetic",
        "data_seed": seed,
        "dataset_rows": int(len(data.y)),
        "dataset_positive_rate": float(data.y.mean()),
        "params": {k: v for k, v in XGB_PARAMS.items()},
        "xgboost_version": xgb.__version__,
        "thresholds": {"flagged": FLAG_THRESHOLD, "blocked": BLOCK_THRESHOLD},
        "metrics": metrics,
    }
    (directory / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return directory


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=SERVICE_ROOT / "artifacts")
    args = parser.parse_args()
    model, metrics, data = train(args.seed)
    directory = write_artifact(model, metrics, data, args.seed, args.out)
    test = metrics["test"]
    logger.info("wrote %s", directory)
    logger.info(
        "SYNTHETIC test split: PR-AUC=%.3f precision@0.3=%.3f recall@0.3=%.3f",
        test["pr_auc"],
        test["at_flag_threshold"]["precision"],
        test["at_flag_threshold"]["recall"],
    )


if __name__ == "__main__":
    main()
