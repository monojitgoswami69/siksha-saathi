"""
Database helpers — psycopg3 async connection pool.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import get_settings

logger = logging.getLogger(__name__)

_pool: Optional[AsyncConnectionPool] = None


async def get_pool() -> AsyncConnectionPool:
    """Return (and lazily create) the shared async connection pool."""
    global _pool
    if _pool is None:
        settings = get_settings()
        conninfo = settings.database_url
        # Handle local vs cloud SSL
        if "localhost" in conninfo or "127.0.0.1" in conninfo:
            conninfo = conninfo.replace("sslmode=verify-full", "sslmode=disable")
            conninfo = conninfo.replace("sslmode=require", "sslmode=disable")
            conninfo = conninfo.replace("channel_binding=require", "")
            if "sslmode" not in conninfo:
                sep = "&" if "?" in conninfo else "?"
                conninfo += f"{sep}sslmode=disable"
        else:
            # Fix SSL: Neon's verify-full requires local root.crt; use require instead
            conninfo = conninfo.replace("sslmode=verify-full", "sslmode=require")
            conninfo = conninfo.replace("channel_binding=require", "")
            while "&&" in conninfo:
                conninfo = conninfo.replace("&&", "&")
            conninfo = conninfo.rstrip("&").rstrip("?")
            if "neon.tech" in conninfo and "sslmode" not in conninfo:
                sep = "&" if "?" in conninfo else "?"
                conninfo += f"{sep}sslmode=require"
        _pool = AsyncConnectionPool(
            conninfo=conninfo,
            min_size=1,
            max_size=5,
            open=False,
            kwargs={"row_factory": dict_row, "autocommit": True},
        )
        await _pool.open()
        logger.info("✅ PostgreSQL connection pool opened (autocommit=True)")
    return _pool


async def query(sql: str, params: tuple | list | None = None) -> list[dict[str, Any]]:
    """Execute a query and return all rows as dicts."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            if cur.description is None:
                return []
            return await cur.fetchall()


async def execute(sql: str, params: tuple | list | None = None) -> int:
    """Execute a statement and return affected row count."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            return cur.rowcount


@asynccontextmanager
async def transaction() -> AsyncGenerator[psycopg.AsyncCursor, None]:
    """Provide a transactional cursor."""
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.transaction():
            async with conn.cursor() as cur:
                yield cur


async def close_pool() -> None:
    """Gracefully close the pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("PostgreSQL pool closed")
