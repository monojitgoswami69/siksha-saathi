"""
CrossEncoder reranker model singleton.

Loads the CrossEncoder model ONCE at process startup (lifespan)
and executes joint query-document relevance scoring.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from sentence_transformers import CrossEncoder

from .config import Settings

logger = logging.getLogger("embedding-service.reranker")

# ── Module-level singleton ──────────────────────────────────────────────
_reranker: CrossEncoder | None = None
_reranker_model_name: str = ""
_reranker_load_time: float = 0.0
_reranker_enabled: bool = True


def load_reranker(settings: Settings) -> None:
    """
    Eagerly load the CrossEncoder model during lifespan startup.
    """
    global _reranker, _reranker_model_name, _reranker_load_time, _reranker_enabled

    _reranker_enabled = settings.reranker_enabled
    _reranker_model_name = settings.reranker_model

    if not _reranker_enabled:
        logger.info("ℹ️ Cross-encoder reranker is DISABLED via config.")
        return

    logger.info("Loading cross-encoder reranker model: %s...", _reranker_model_name)
    t0 = time.perf_counter()
    _reranker = CrossEncoder(_reranker_model_name)
    _reranker_load_time = time.perf_counter() - t0
    logger.info("✅ Reranker model loaded in %.2fs", _reranker_load_time)

    # Warmup inference
    t1 = time.perf_counter()
    _ = _reranker.predict([("warmup query", "warmup passage")])
    warmup = time.perf_counter() - t1
    logger.info("✅ Reranker warmup inference: %.3fs", warmup)


def is_reranker_ready() -> bool:
    """True if reranker is loaded and ready, or false if not ready / disabled."""
    return _reranker is not None


def get_reranker_info() -> dict:
    """Return reranker metadata."""
    return {
        "model_name": _reranker_model_name,
        "enabled": _reranker_enabled,
        "ready": _reranker is not None,
        "load_time_s": round(_reranker_load_time, 3),
    }


def rerank_documents(
    query: str,
    documents: list[str],
    top_k: Optional[int] = None,
) -> list[dict]:
    """
    Score relevance of (query, document) pairs using the cross-encoder.

    Returns a list of dicts:
      [
        {"index": original_doc_index, "score": float_relevance_score},
        ...
      ]
    sorted descending by relevance score.
    """
    if not documents:
        return []

    if _reranker is None:
        raise RuntimeError("Reranker model not loaded or disabled. Call load_reranker() first.")

    pairs = [(query, doc) for doc in documents]
    raw_scores = _reranker.predict(pairs, show_progress_bar=False)

    # Convert to standard Python float list
    if hasattr(raw_scores, "tolist"):
        scores_list = raw_scores.tolist()
    else:
        scores_list = [float(s) for s in raw_scores]

    # Associate with original document index
    indexed_scores = [
        {"index": idx, "score": float(scores_list[idx])}
        for idx in range(len(documents))
    ]

    # Sort descending by cross-encoder score
    indexed_scores.sort(key=lambda x: x["score"], reverse=True)

    if top_k is not None and top_k > 0:
        indexed_scores = indexed_scores[:top_k]

    return indexed_scores
