"""
Configuration — Pydantic Settings with environment variable validation.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    """Application settings — validated on startup, fails fast on missing required values."""

    # Database
    database_url: str = Field(..., alias="DATABASE_URL")

    # Storage
    storage_provider: str = Field(default="r2", alias="STORAGE_PROVIDER")
    r2_account_id: str = Field(default="", alias="R2_ACCOUNT_ID")
    r2_access_key_id: str = Field(default="", alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str = Field(default="", alias="R2_SECRET_ACCESS_KEY")
    r2_bucket_name: str = Field(default="siksha-saathi", alias="R2_BUCKET_NAME")

    # Dropbox
    dropbox_app_key: str = Field(default="", alias="DROPBOX_APP_KEY")
    dropbox_app_secret: str = Field(default="", alias="DROPBOX_APP_SECRET")
    dropbox_refresh_token: str = Field(default="", alias="DROPBOX_REFRESH_TOKEN")

    # Embedding model
    embedding_model: str = Field(
        default="intfloat/multilingual-e5-small", alias="LOCAL_EMBEDDING_MODEL"
    )
    embedding_dim: int = Field(default=384, alias="LOCAL_EMBEDDING_DIM")
    embedding_batch_size: int = Field(default=32, alias="EMBEDDING_BATCH_SIZE")

    # OCR
    tesseract_langs: str = Field(default="eng+hin", alias="TESSERACT_LANGS")
    ocr_min_text_chars: int = Field(default=20, alias="OCR_MIN_TEXT_CHARS")
    ocr_max_pages: int = Field(default=50, alias="OCR_MAX_PAGES")

    # Chunking
    chunk_size: int = Field(default=800, alias="CHUNK_SIZE")
    chunk_overlap: int = Field(default=100, alias="CHUNK_OVERLAP")

    # Worker
    poll_interval_ms: int = Field(default=5000, alias="POLL_INTERVAL_MS")
    max_attempts: int = Field(default=3, alias="MAX_ATTEMPTS")

    # Benchmark
    benchmark_mode: bool = Field(default=False, alias="BENCHMARK_MODE")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


# Singleton
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
