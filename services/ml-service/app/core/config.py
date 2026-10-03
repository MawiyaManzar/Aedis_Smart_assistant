"""Runtime settings loaded from the environment."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Local defaults match docker-compose placeholders and must be overridden in production."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_name: str = "aedis-ml-service"
    service_version: str = "0.1.0"
    model_env: str = "local"
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://aedis_app:aedis_app_password@localhost:5432/aedis_db"
    redis_url: str = "redis://localhost:6379/0"
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "aedis_password"
    readiness_timeout_seconds: float = 2.0

    artifacts_dir: Path = SERVICE_ROOT / "artifacts"
    fraud_model_version: str = "fraud-v1"
    distress_model_version: str = "distress-v1"
    # True: abort startup if a model artifact is missing/corrupt. False: start degraded and
    # answer scoring requests with 503 MODEL_NOT_LOADED.
    require_models: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
