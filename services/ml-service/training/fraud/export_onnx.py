"""Export the trained XGBoost fraud model to ONNX and verify parity with the native model."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import onnxruntime as ort
import xgboost as xgb
from onnxmltools import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType

from app.features.fraud import FRAUD_FEATURE_ORDER

ONNX_FILENAME = "model.onnx"
PARITY_TOLERANCE = 1e-5


def _positive_class_probability(session: ort.InferenceSession, x: np.ndarray) -> np.ndarray:
    outputs = session.run(None, {session.get_inputs()[0].name: x})
    probabilities = outputs[1]  # [label, probabilities]
    if isinstance(probabilities, list):  # zipmap output; we disable it, but stay defensive
        return np.asarray([row[1] for row in probabilities], dtype=np.float64)
    return np.asarray(probabilities, dtype=np.float64)[:, 1]


def export_onnx(model: xgb.XGBClassifier, directory: Path) -> Path:
    """Write ``model.onnx`` next to the XGBoost JSON. Input: float32 [N, n_features]."""
    onnx_model = convert_xgboost(
        model,
        initial_types=[("features", FloatTensorType([None, len(FRAUD_FEATURE_ORDER)]))],
        target_opset=15,
    )
    path = directory / ONNX_FILENAME
    path.write_bytes(onnx_model.SerializeToString())
    return path


def check_parity(model: xgb.XGBClassifier, onnx_path: Path, x: np.ndarray) -> float:
    """Return the max absolute probability difference between XGBoost and ONNX Runtime."""
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    native = model.predict_proba(x)[:, 1].astype(np.float64)
    exported = _positive_class_probability(session, x.astype(np.float32))
    return float(np.max(np.abs(native - exported)))
