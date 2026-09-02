"""
Storage download — Cloudflare R2 (S3-compatible) and local filesystem.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


async def download_file(file_key: str, provider: str = "r2") -> Optional[bytes]:
    """Download a file from Cloudflare R2 or local storage."""
    from .config import get_settings
    settings = get_settings()

    clean_key = file_key.lstrip("/")

    # 1. Cloudflare R2 (S3-compatible)
    if provider in ("r2", "") and settings.r2_access_key_id and not settings.r2_access_key_id.startswith("dummy"):
        try:
            import boto3
            s3 = boto3.client(
                "s3",
                endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
                aws_access_key_id=settings.r2_access_key_id,
                aws_secret_access_key=settings.r2_secret_access_key,
                region_name="auto",
            )
            response = s3.get_object(Bucket=settings.r2_bucket_name, Key=clean_key)
            return response["Body"].read()
        except Exception as e:
            logger.warning("R2 download error for %s: %s (checking local storage fallback)", clean_key, e)

    # 2. Local filesystem storage (.storage/ or LOCAL_STORAGE_PATH)
    local_dir = os.environ.get("LOCAL_STORAGE_PATH", "")
    candidates = []
    if local_dir:
        candidates.append(Path(local_dir) / clean_key)
        candidates.append(Path(local_dir) / Path(clean_key).name)
    for base in [Path.cwd(), Path.cwd().parent, Path(__file__).parent.parent.parent]:
        candidates.append(base / ".storage" / clean_key)
        candidates.append(base / ".storage" / Path(clean_key).name)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            try:
                return candidate.read_bytes()
            except Exception as e:
                logger.error("Error reading local storage file %s: %s", candidate, e)

    logger.error("Could not find file in R2 or local storage: %s", file_key)
    return None
