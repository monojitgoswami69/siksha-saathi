"""
LRU cache for query embeddings with metrics.
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Optional, List


class EmbeddingCache:
    """Thread-safe LRU cache for query embeddings."""

    def __init__(self, max_size: int = 2000):
        self._cache: OrderedDict[str, List[float]] = OrderedDict()
        self._max_size = max_size
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    @staticmethod
    def _normalize_key(text: str) -> str:
        """Normalize text to a cache key."""
        return text.strip().lower()

    def get(self, text: str) -> Optional[List[float]]:
        """Get cached embedding. Returns None on miss."""
        key = self._normalize_key(text)
        with self._lock:
            if key in self._cache:
                self._hits += 1
                self._cache.move_to_end(key)
                return self._cache[key]
            self._misses += 1
            return None

    def put(self, text: str, embedding: List[float]) -> None:
        """Cache an embedding. Evicts LRU entry if at capacity."""
        key = self._normalize_key(text)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                self._cache[key] = embedding
            else:
                if len(self._cache) >= self._max_size:
                    self._cache.popitem(last=False)
                self._cache[key] = embedding

    @property
    def hits(self) -> int:
        return self._hits

    @property
    def misses(self) -> int:
        return self._misses

    @property
    def size(self) -> int:
        return len(self._cache)

    @property
    def max_size(self) -> int:
        return self._max_size

    @property
    def hit_rate(self) -> float:
        total = self._hits + self._misses
        return self._hits / total if total > 0 else 0.0
