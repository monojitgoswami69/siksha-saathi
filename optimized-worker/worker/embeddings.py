"""
Embedding client — HTTP calls to the local embedding service.

The worker does NOT load SentenceTransformer.
All embedding requests go through the embedding service at http://127.0.0.1:8100.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx
import numpy as np

logger = logging.getLogger(__name__)

EMBEDDING_SERVICE_URL = os.environ.get("LOCAL_EMBEDDING_URL", "http://127.0.0.1:8100")
TIMEOUT_S = 30.0


def get_service_url() -> str:
    """Return the current embedding service URL."""
    return os.environ.get("LOCAL_EMBEDDING_URL", EMBEDDING_SERVICE_URL)


def set_service_url(url: str) -> None:
    """Override the embedding service URL."""
    global EMBEDDING_SERVICE_URL
    EMBEDDING_SERVICE_URL = url


def format_vector(values) -> str:
    """Format a numpy array or list as PostgreSQL pgvector string '[0.1,0.2,...]'."""
    if isinstance(values, np.ndarray):
        values = values.tolist()
    if isinstance(values, list) and len(values) > 0 and isinstance(values[0], list):
        values = values[0]
    return "[" + ",".join(f"{v:.6f}" for v in values) + "]"


async def check_service_ready() -> bool:
    """Check if the embedding service is ready."""
    url = get_service_url()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{url}/health", timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("status") == "ready"
    except Exception:
        pass
    return False


async def wait_for_service(max_wait_s: float = 120, poll_interval_s: float = 2.0) -> bool:
    """Wait for the embedding service to be ready."""
    import asyncio
    url = get_service_url()
    elapsed = 0.0
    while elapsed < max_wait_s:
        if await check_service_ready():
            logger.info("✅ Embedding service is ready at %s", url)
            return True
        logger.info("⏳ Waiting for embedding service at %s... (%.0fs)", url, elapsed)
        await asyncio.sleep(poll_interval_s)
        elapsed += poll_interval_s
    logger.error("❌ Embedding service not ready after %.0fs at %s", max_wait_s, url)
    return False


async def embed_texts_via_service(
    texts: list[str],
    is_query: bool = False,
) -> list[list[float]]:
    """
    Get batch embeddings from the embedding service via HTTP.

    This does NOT load SentenceTransformer locally.
    The embedding service handles model loading, E5 prefixes, and normalization.
    """
    if not texts:
        return []

    url = get_service_url()
    t0 = time.perf_counter()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{url}/embed/batch",
            json={"texts": texts, "is_query": is_query},
            timeout=TIMEOUT_S,
        )

    if resp.status_code != 200:
        raise RuntimeError(
            f"Embedding service returned {resp.status_code}: {resp.text}. "
            f"Is the service running at {url}?"
        )

    data = resp.json()
    elapsed = time.perf_counter() - t0
    logger.debug(
        "Embedded %d texts via service in %.3fs (%.1f texts/sec)",
        len(texts), elapsed, len(texts) / elapsed if elapsed > 0 else 0,
    )

    return data["embeddings"]


async def embed_single_via_service(text: str, is_query: bool = True) -> list[float]:
    """Get a single embedding from the embedding service."""
    url = get_service_url()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{url}/embed",
            json={"text": text, "is_query": is_query},
            timeout=TIMEOUT_S,
        )

    if resp.status_code != 200:
        raise RuntimeError(
            f"Embedding service returned {resp.status_code}: {resp.text}"
        )

    return resp.json()["embedding"]


def get_model_dim() -> int:
    """Return the embedding dimension (384 for E5-small)."""
    return 384
