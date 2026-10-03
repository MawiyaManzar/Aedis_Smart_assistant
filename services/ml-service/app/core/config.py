"""Runtime settings loaded from the environment."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    database_url: str = "postgresql+psycopg://aedis_admin:aedis_password@localhost:5432/aedis_db"
    redis_url: str = "redis://localhost:6379/0"
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "aedis_password"
    fraud_model_path: str | None = None
    distress_model_path: str | None = None
    readiness_timeout_seconds: float = 2.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
