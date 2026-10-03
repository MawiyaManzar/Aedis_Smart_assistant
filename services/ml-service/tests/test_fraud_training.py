"""Training-pipeline tests (small, fast; the full 30k-row run is exercised by the CLI)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from app.core.config import SERVICE_ROOT
from app.features.fraud import FRAUD_FEATURE_ORDER
from training.fraud.data import generate
from training.fraud.train import build_dataset, time_split


def test_generator_is_deterministic() -> None:
    a = generate(seed=3, n_customers=15)
    b = generate(seed=3, n_customers=15)
    assert [x.event.transaction_id for x in a] == [x.event.transaction_id for x in b]
    assert [x.label for x in a] == [x.label for x in b]
    assert [x.graph_hops for x in a] == [x.graph_hops for x in b]


def test_dataset_is_time_ordered_with_both_classes_and_valid_hops() -> None:
    labeled = generate(seed=3, n_customers=15)
    stamps = [x.event.timestamp for x in labeled]
    assert stamps == sorted(stamps)
    assert {x.label for x in labeled} == {0, 1}
    assert any(x.graph_hops is None for x in labeled) or len(labeled) < 400  # outages simulated
    data = build_dataset(labeled)
    assert data.x.shape == (len(labeled), len(FRAUD_FEATURE_ORDER))
    assert np.isfinite(data.x).all()
    hops = data.x[:, FRAUD_FEATURE_ORDER.index("graph_hops")]
    assert hops.min() >= -1 and hops.max() <= 4


def test_time_split_is_chronological_and_complete() -> None:
    train, valid, test = time_split(1000)
    assert train.start == 0 and train.stop == valid.start and valid.stop == test.start
    assert test.stop == 1000


def test_committed_artifact_matches_serving_feature_order() -> None:
    directory = SERVICE_ROOT / "artifacts" / "fraud" / "fraud-v1"
    metadata = json.loads(Path(directory / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["feature_list"] == list(FRAUD_FEATURE_ORDER)
    assert metadata["data_source"] == "synthetic"
    assert (directory / "model.json").is_file()
