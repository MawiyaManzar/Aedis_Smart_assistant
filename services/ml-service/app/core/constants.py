"""Shared constants for the setup-phase service."""

UNSET_MODEL_VERSION = "unset"
FRAUD_STUB_DETAIL = "ONNX fraud weights are not loaded. This is a contract stub, not a model score."
DISTRESS_STUB_DETAIL = (
    "LightGBM distress weights are not loaded. This is a contract stub, not a model score."
)
SHAP_STUB_DETAIL = "SHAP explainer is not loaded. This is a contract stub, not an explanation."
