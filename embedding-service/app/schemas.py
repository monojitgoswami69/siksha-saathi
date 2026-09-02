"""
Pydantic schemas for request/response models.
"""
from pydantic import BaseModel, Field
from typing import List, Optional


class EmbedRequest(BaseModel):
    """Single text embedding request."""
    text: str = Field(..., min_length=1, description="Text to embed")
    is_query: bool = Field(default=True, description="True for queries, False for documents")


class EmbedResponse(BaseModel):
    """Single embedding response."""
    embedding: List[float]
    dim: int
    cached: bool = False
    latency_ms: float = 0.0


class BatchEmbedRequest(BaseModel):
    """Batch embedding request."""
    texts: List[str] = Field(..., min_length=1, description="Texts to embed")
    is_query: bool = Field(default=False, description="True for queries, False for documents")


class BatchEmbedResponse(BaseModel):
    """Batch embedding response."""
    embeddings: List[List[float]]
    dim: int
    count: int
    latency_ms: float = 0.0


class HealthResponse(BaseModel):
    """Health check response."""
    status: str  # "starting" | "ready" | "unhealthy"
    model: Optional[str] = None
    dim: Optional[int] = None
    uptime_s: Optional[float] = None


class MetricsResponse(BaseModel):
    """Cache and service metrics."""
    cache_hits: int
    cache_misses: int
    cache_size: int
    cache_max_size: int
    cache_hit_rate: float
    total_requests: int
    model: str
    dim: int
    uptime_s: float
