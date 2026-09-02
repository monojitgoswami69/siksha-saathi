"""
SentenceTransformer model singleton.

The model is loaded ONCE at process startup and reused for all requests.
DO NOT instantiate SentenceTransformer anywhere else in the codebase.
"""
from __future__ import annotations

import logging
import time

import numpy as np
from sentence_transformers import SentenceTransformer

from .config import Settings

logger = logging.getLogger("embedding-service.model")

# ── Module-level singleton ──────────────────────────────────────────────
_model: SentenceTransformer | None = None
_model_name: str = ""
_model_dim: int = 384
_load_time: float = 0.0
_start_time: float = 0.0


def load_model(settings: Settings) -> None:
    """
    Eagerly load the SentenceTransformer model.

    This MUST be called during process startup (FastAPI lifespan),
    NOT on the first /embed request.
    """
    global _model, _model_name, _model_dim, _load_time, _start_time

    _start_time = time.time()
    _model_name = settings.model_name
    _model_dim = settings.model_dim

    logger.info("Loading embedding model: %s (dim=%d)...", _model_name, _model_dim)
    t0 = time.perf_counter()
    _model = SentenceTransformer(_model_name)
    _load_time = time.perf_counter() - t0
    logger.info("✅ Model loaded in %.2fs", _load_time)

    # Warmup inference to JIT-compile any lazy kernels
    t1 = time.perf_counter()
    _ = _model.encode(["warmup"], normalize_embeddings=True)
    warmup = time.perf_counter() - t1
    logger.info("✅ Warmup inference: %.3fs", warmup)


def is_ready() -> bool:
    """True if the model has been loaded and is ready for inference."""
    return _model is not None


def get_model_info() -> dict:
    """Return model metadata."""
    return {
        "model_name": _model_name,
        "dim": _model_dim,
        "load_time_s": round(_load_time, 3),
        "uptime_s": round(time.time() - _start_time, 1) if _start_time else 0,
    }


def encode_texts(
    texts: list[str],
    is_query: bool = False,
    batch_size: int = 32,
) -> np.ndarray:
    """
    Encode texts into normalized embeddings.

    For E5 models, applies the correct instruction prefix:
    - query:   "query: <text>"
    - document: "passage: <text>"

    Returns shape (len(texts), dim) with L2-normalized vectors.
    """
    if _model is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    # Apply E5 instruction prefix
    if "e5" in _model_name.lower():
        prefix = "query: " if is_query else "passage: "
        texts = [prefix + t for t in texts]

    return _model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=False,
    )


def encode_single(text: str, is_query: bool = True) -> np.ndarray:
    """Encode a single text."""
    return encode_texts([text], is_query=is_query, batch_size=1)[0]
