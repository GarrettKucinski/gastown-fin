"""Background price simulator using geometric Brownian motion.

Writes to the shared PriceCache at ~500ms intervals.
This serves as the default MarketDataProvider when no external
data source (e.g., Massive API) is configured.
"""

from __future__ import annotations

import asyncio
import math
import random

from app.price_cache import price_cache

# Realistic seed prices for popular US tickers
SEED_PRICES: dict[str, float] = {
    "AAPL": 178.50,
    "GOOGL": 141.80,
    "MSFT": 378.90,
    "AMZN": 178.25,
    "TSLA": 248.40,
    "NVDA": 495.20,
    "META": 390.10,
    "JPM": 183.60,
    "V": 275.30,
    "NFLX": 485.70,
}

# GBM parameters
_DT = 0.5 / 252 / 6.5 / 3600  # ~500ms in trading-year units
_MU = 0.08  # 8% annual drift
_SIGMA = 0.25  # 25% annual volatility
_EVENT_PROBABILITY = 0.005  # 0.5% chance of a sudden event per tick
_EVENT_MAGNITUDE_MIN = 0.02  # 2% sudden move
_EVENT_MAGNITUDE_MAX = 0.05  # 5% sudden move

# Default price for unknown tickers
_DEFAULT_SEED = 100.0

UPDATE_INTERVAL = 0.5  # seconds


class PriceSimulator:
    """GBM-based price simulator that writes to the shared PriceCache."""

    def __init__(self) -> None:
        self._prices: dict[str, float] = {}
        self._task: asyncio.Task[None] | None = None

    def _get_price(self, ticker: str) -> float:
        """Get current simulated price, seeding if necessary."""
        if ticker not in self._prices:
            self._prices[ticker] = SEED_PRICES.get(ticker, _DEFAULT_SEED)
        return self._prices[ticker]

    def _step(self, ticker: str) -> float:
        """Advance one GBM step for a ticker and return the new price."""
        current = self._get_price(ticker)

        # Standard GBM step
        z = random.gauss(0, 1)
        drift = (_MU - 0.5 * _SIGMA**2) * _DT
        diffusion = _SIGMA * math.sqrt(_DT) * z
        new_price = current * math.exp(drift + diffusion)

        # Occasional random event (sudden 2-5% move)
        if random.random() < _EVENT_PROBABILITY:
            magnitude = random.uniform(_EVENT_MAGNITUDE_MIN, _EVENT_MAGNITUDE_MAX)
            direction = random.choice([-1, 1])
            new_price *= 1 + direction * magnitude

        # Clamp to 2 decimal places
        new_price = round(max(new_price, 0.01), 2)
        self._prices[ticker] = new_price
        return new_price

    async def run(self) -> None:
        """Run the simulation loop indefinitely."""
        # Initialize all seed tickers in the cache
        tickers = list(SEED_PRICES.keys())
        for ticker in tickers:
            price = self._get_price(ticker)
            price_cache.update(ticker, price)
        await price_cache.notify()

        while True:
            await asyncio.sleep(UPDATE_INTERVAL)

            for ticker in tickers:
                new_price = self._step(ticker)
                price_cache.update(ticker, new_price)

            await price_cache.notify()

    def start(self) -> asyncio.Task[None]:
        """Start the simulation as a background task."""
        self._task = asyncio.create_task(self.run())
        return self._task

    def stop(self) -> None:
        """Cancel the background simulation task."""
        if self._task is not None:
            self._task.cancel()
            self._task = None
