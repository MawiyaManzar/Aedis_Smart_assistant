def test_core_imports() -> None:
    import lightgbm
    import numpy
    import onnx
    import onnxruntime
    import pandas
    import shap
    import sklearn
    import xgboost

    from app.features.distress import DistressFeatureBuilder
    from app.features.fraud import FraudFeatureBuilder
    from app.main import app
    from app.models.loaders import LightGbmDistressModelLoader, OnnxFraudModelLoader

    assert app.title == "Aedis ML Service"
    assert numpy.__version__
    assert pandas.__version__
    assert onnx.__version__
    assert onnxruntime.__version__
    assert xgboost.__version__
    assert lightgbm.__version__
    assert shap.__version__
    assert sklearn.__version__
    assert FraudFeatureBuilder.feature_names
    assert DistressFeatureBuilder.feature_names
    assert OnnxFraudModelLoader(None).is_loaded is False
    assert LightGbmDistressModelLoader(None).is_loaded is False
