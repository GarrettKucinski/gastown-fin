"""Shared in-memory price cache.

Stores latest price, previous price, and timestamp per ticker.
Written by the simulator (or Massive poller) background task,
read by the SSE streaming endpoint.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field


@dataclass(slots=True)
class PriceEntry:
    """A single ticker's cached price data."""

    ticker: str
    price: float
    previous_price: float
    timestamp: float
    change_direction: str  # "up", "down", or "flat"


class PriceCache:
    """Thread-safe in-memory cache for latest ticker prices.

    Supports fan-out notification to multiple SSE subscribers via
    asyncio.Condition.
    """

    def __init__(self) -> None:
        self._prices: dict[str, PriceEntry] = {}
        self._condition = asyncio.Condition()

    def update(self, ticker: str, price: float) -> PriceEntry:
        """Update a ticker's price synchronously (call from async context).

        Returns the new PriceEntry for convenience.
        """
        prev = self._prices.get(ticker)
        previous_price = prev.price if prev else price

        if price > previous_price:
            direction = "up"
        elif price < previous_price:
            direction = "down"
        else:
            direction = "flat"

        entry = PriceEntry(
            ticker=ticker,
            price=price,
            previous_price=previous_price,
            timestamp=time.time(),
            change_direction=direction,
        )
        self._prices[ticker] = entry
        return entry

    async def notify(self) -> None:
        """Signal all waiting SSE subscribers that new data is available."""
        async with self._condition:
            self._condition.notify_all()

    async def wait_for_update(self) -> None:
        """Block until the next batch of price updates is available."""
        async with self._condition:
            await self._condition.wait()

    def snapshot(self) -> list[PriceEntry]:
        """Return a copy of all current price entries."""
        return list(self._prices.values())

    def get(self, ticker: str) -> PriceEntry | None:
        """Get the cached entry for a single ticker."""
        return self._prices.get(ticker)


# Module-level singleton — shared across the app
price_cache = PriceCache()
