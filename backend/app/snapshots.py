"""Portfolio snapshot background task.

Records portfolio total value to portfolio_snapshots every 30 seconds.
Provides take_snapshot() for on-demand capture after trade execution.
Cleans up rows older than 24 hours periodically.
"""

from __future__ import annotations

import asyncio
import logging

from app.db import get_pool
from app.price_cache import price_cache

logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL = 30  # seconds between periodic snapshots
CLEANUP_INTERVAL = 3600  # seconds between cleanup runs (1 hour)
RETENTION_HOURS = 24  # delete snapshots older than this


async def take_snapshot(user_id: str) -> None:
    """Calculate and record a portfolio snapshot for a single user.

    Total value = cash_balance + sum(position.quantity * current_price).
    Positions whose ticker has no cached price are valued at their avg_cost.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Fetch cash balance
        row = await conn.fetchrow(
            "SELECT cash_balance FROM users_profile WHERE user_id = $1",
            user_id,
        )
        if row is None:
            return
        cash_balance = float(row["cash_balance"])

        # Fetch open positions
        positions = await conn.fetch(
            "SELECT symbol, quantity, avg_cost FROM positions WHERE user_id = $1 AND quantity > 0",
            user_id,
        )

        # Value each position using the price cache
        positions_value = 0.0
        for pos in positions:
            qty = float(pos["quantity"])
            entry = price_cache.get(pos["symbol"])
            if entry is not None:
                positions_value += qty * entry.price
            else:
                # Fallback to avg_cost if no live price available
                positions_value += qty * float(pos["avg_cost"])

        total_value = cash_balance + positions_value

        await conn.execute(
            """
            INSERT INTO portfolio_snapshots (user_id, total_value, cash_balance)
            VALUES ($1, $2, $3)
            """,
            user_id,
            total_value,
            cash_balance,
        )


async def _cleanup_old_snapshots() -> None:
    """Delete portfolio snapshots older than RETENTION_HOURS."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        deleted = await conn.execute(
            "DELETE FROM portfolio_snapshots WHERE snapshot_at < now() - interval '1 hour' * $1",
            RETENTION_HOURS,
        )
        logger.debug("Snapshot cleanup: %s", deleted)


class PortfolioSnapshotter:
    """Background task manager for periodic portfolio snapshots and cleanup."""

    def __init__(self) -> None:
        self._snapshot_task: asyncio.Task[None] | None = None
        self._cleanup_task: asyncio.Task[None] | None = None

    async def _snapshot_loop(self) -> None:
        """Take a snapshot for every user every SNAPSHOT_INTERVAL seconds."""
        while True:
            await asyncio.sleep(SNAPSHOT_INTERVAL)
            try:
                pool = await get_pool()
                async with pool.acquire() as conn:
                    user_ids = await conn.fetch("SELECT id FROM users")
                for row in user_ids:
                    await take_snapshot(row["id"])
            except Exception:
                logger.exception("Error in periodic snapshot loop")

    async def _cleanup_loop(self) -> None:
        """Run cleanup every CLEANUP_INTERVAL seconds."""
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL)
            try:
                await _cleanup_old_snapshots()
            except Exception:
                logger.exception("Error in snapshot cleanup loop")

    def start(self) -> None:
        """Start both background loops as asyncio tasks."""
        self._snapshot_task = asyncio.create_task(self._snapshot_loop())
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    def stop(self) -> None:
        """Cancel both background tasks."""
        if self._snapshot_task is not None:
            self._snapshot_task.cancel()
            self._snapshot_task = None
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            self._cleanup_task = None
