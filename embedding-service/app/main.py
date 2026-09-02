"""
Embedding Service — FastAPI application.

The SentenceTransformer model is loaded EAGERLY during the lifespan startup
event, BEFORE the server accepts any HTTP requests.

Endpoints:
    GET  /health        — readiness check (starting | ready)
    POST /embed         — single text → 384-dim vector (LRU cached for queries)
    POST /embed/batch   — batch texts → list of vectors
    GET  /metrics       — cache and service statistics
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings
from .model import load_model, is_ready, get_model_info, encode_single, encode_texts
from .cache import EmbeddingCache
from .schemas import (
    EmbedRequest,
    EmbedResponse,
    BatchEmbedRequest,
    BatchEmbedResponse,
    HealthResponse,
    MetricsResponse,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("embedding-service")

# Suppress noisy libraries
logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
logging.getLogger("transformers").setLevel(logging.WARNING)

settings = Settings()
cache = EmbeddingCache(max_size=settings.cache_max_size)
_total_requests = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan handler: load the model BEFORE accepting requests.

    The /health endpoint returns "starting" until this completes.
    After load_model() returns, /health returns "ready" and the
    server begins accepting /embed requests.
    """
    logger.info("🚀 Starting embedding service...")
    logger.info("   Model: %s", settings.model_name)
    logger.info("   Dim: %d", settings.model_dim)
    logger.info("   Cache: %d entries max", settings.cache_max_size)
    logger.info("   Batch size: %d", settings.batch_size)

    load_model(settings)

    logger.info("✅ Embedding service READY on http://%s:%d", settings.host, settings.port)
    yield
    logger.info("Shutting down embedding service.")


app = FastAPI(
    title="Siksha Saathi Embedding Service",
    description="Local E5-small embedding service with LRU cache",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Service readiness check."""
    if not is_ready():
        return HealthResponse(status="starting")

    info = get_model_info()
    return HealthResponse(
        status="ready",
        model=info["model_name"],
        dim=info["dim"],
        uptime_s=info["uptime_s"],
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    """
    Generate embedding for a single text.

    Query embeddings are cached (LRU, configurable max size).
    Document embeddings are not cached.

    Preprocessing applied:
    - E5 prefix: "query: " for queries, "passage: " for documents
    - L2 normalization
    """
    global _total_requests
    _total_requests += 1

    if not is_ready():
        raise HTTPException(status_code=503, detail="Model not ready")

    # Check cache for queries
    if req.is_query:
        cached = cache.get(req.text)
        if cached is not None:
            return EmbedResponse(
                embedding=cached,
                dim=len(cached),
                cached=True,
                latency_ms=0.0,
            )

    t0 = time.perf_counter()
    vec = encode_single(req.text, is_query=req.is_query)
    latency = (time.perf_counter() - t0) * 1000

    embedding = vec.tolist()

    # Cache query embeddings
    if req.is_query:
        cache.put(req.text, embedding)

    return EmbedResponse(
        embedding=embedding,
        dim=len(embedding),
        cached=False,
        latency_ms=round(latency, 2),
    )


@app.post("/embed/batch", response_model=BatchEmbedResponse)
async def embed_batch(req: BatchEmbedRequest):
    """
    Generate embeddings for a batch of texts.

    Batch embeddings are NOT cached (designed for ingestion).
    Uses batch_size=32 internally for optimal throughput.

    Preprocessing applied:
    - E5 prefix: "query: " for queries, "passage: " for documents
    - L2 normalization
    """
    global _total_requests
    _total_requests += 1

    if not is_ready():
        raise HTTPException(status_code=503, detail="Model not ready")

    t0 = time.perf_counter()
    vecs = encode_texts(req.texts, is_query=req.is_query, batch_size=settings.batch_size)
    latency = (time.perf_counter() - t0) * 1000

    embeddings = [v.tolist() for v in vecs]

    return BatchEmbedResponse(
        embeddings=embeddings,
        dim=settings.model_dim,
        count=len(embeddings),
        latency_ms=round(latency, 2),
    )


@app.get("/metrics", response_model=MetricsResponse)
async def metrics():
    """Cache and service metrics."""
    info = get_model_info()
    return MetricsResponse(
        cache_hits=cache.hits,
        cache_misses=cache.misses,
        cache_size=cache.size,
        cache_max_size=cache.max_size,
        cache_hit_rate=round(cache.hit_rate, 4),
        total_requests=_total_requests,
        model=info["model_name"],
        dim=info["dim"],
        uptime_s=info["uptime_s"],
    )
