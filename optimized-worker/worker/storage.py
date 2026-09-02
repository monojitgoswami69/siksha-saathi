"""
Storage download — R2 (S3-compatible) and Dropbox.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


async def download_file(file_key: str, provider: str = "r2") -> Optional[bytes]:
    """Download a file from storage by key + provider."""
    from .config import get_settings
    settings = get_settings()

    # R2 / S3
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
            response = s3.get_object(Bucket=settings.r2_bucket_name, Key=file_key)
            return response["Body"].read()
        except Exception as e:
            logger.error("R2 download error for %s: %s", file_key, e)

    # Dropbox fallback
    if provider == "dropbox" or file_key.startswith("/"):
        try:
            # Get temporary link via Dropbox API
            async with httpx.AsyncClient() as client:
                token_resp = await client.post(
                    "https://api.dropboxapi.com/oauth2/token",
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": settings.dropbox_refresh_token,
                        "client_id": settings.dropbox_app_key,
                        "client_secret": settings.dropbox_app_secret,
                    },
                )
                if token_resp.status_code != 200:
                    logger.error("Dropbox token refresh failed")
                    return None

                access_token = token_resp.json()["access_token"]
                link_resp = await client.post(
                    "https://api.dropboxapi.com/2/files/get_temporary_link",
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={"path": file_key},
                )
                if link_resp.status_code != 200:
                    return None

                link = link_resp.json()["link"]
                file_resp = await client.get(link)
                if file_resp.status_code == 200:
                    return file_resp.content
        except Exception as e:
            logger.error("Dropbox download error: %s", e)

    # Local filesystem fallback (.storage/)
    from pathlib import Path
    for base in [Path.cwd(), Path.cwd().parent, Path(__file__).parent.parent.parent]:
        candidate = base / ".storage" / file_key
        if candidate.exists() and candidate.is_file():
            try:
                return candidate.read_bytes()
            except Exception as e:
                logger.error("Error reading local storage file %s: %s", candidate, e)

    return None
