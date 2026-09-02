"""
Configuration for the embedding service.
"""
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Embedding service settings."""

    # Model
    model_name: str = Field(default="intfloat/multilingual-e5-small", alias="EMBEDDING_MODEL")
    model_dim: int = Field(default=384, alias="EMBEDDING_DIM")
    batch_size: int = Field(default=32, alias="EMBEDDING_BATCH_SIZE")

    # Cache
    cache_max_size: int = Field(default=2000, alias="EMBEDDING_CACHE_MAX_SIZE")

    # Server
    host: str = Field(default="127.0.0.1", alias="EMBEDDING_HOST")
    port: int = Field(default=8100, alias="EMBEDDING_PORT")

    model_config = {
        "env_file": [str(Path(__file__).parent.parent / ".env"), ".env"],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }
