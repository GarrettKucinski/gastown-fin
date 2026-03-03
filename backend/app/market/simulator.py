"""Geometric Brownian Motion market data simulator.

Produces realistic-looking price movements for ~50 US equity tickers with:
- Sector-correlated moves (tech stocks move together, etc.)
- Occasional random events (2-5% sudden jumps/drops)
- ~500ms update cadence
"""

import asyncio
import logging
import math
import random
import time
from collections.abc import Callable

from app.market.provider import MarketDataProvider, PriceUpdate

logger = logging.getLogger(__name__)

# ── Sector definitions with seed prices ──────────────────────────────────

SECTORS: dict[str, dict[str, float]] = {
    "tech": {
        "AAPL": 175.0, "MSFT": 415.0, "GOOGL": 170.0, "AMZN": 185.0,
        "NVDA": 880.0, "META": 500.0, "TSLA": 195.0, "AVGO": 1350.0,
        "CRM": 310.0, "ADBE": 600.0, "AMD": 175.0, "INTC": 45.0,
        "ORCL": 170.0, "CSCO": 50.0,
    },
    "financial": {
        "JPM": 195.0, "V": 280.0, "MA": 465.0, "BAC": 37.0,
        "WFC": 55.0, "GS": 400.0, "MS": 95.0, "AXP": 220.0,
        "BLK": 850.0, "C": 60.0,
    },
    "healthcare": {
        "JNJ": 155.0, "UNH": 530.0, "PFE": 27.0, "MRK": 125.0,
        "ABBV": 175.0, "LLY": 800.0, "TMO": 560.0, "ABT": 115.0,
    },
    "consumer": {
        "WMT": 175.0, "PG": 165.0, "KO": 60.0, "PEP": 170.0,
        "MCD": 290.0, "NKE": 100.0, "SBUX": 95.0, "HD": 365.0,
        "COST": 750.0,
    },
    "energy": {
        "XOM": 105.0, "CVX": 155.0, "COP": 115.0,
    },
    "industrial": {
        "CAT": 340.0, "UPS": 145.0, "BA": 215.0, "HON": 210.0,
        "GE": 160.0,
    },
    "communication": {
        "DIS": 110.0, "NFLX": 625.0, "T": 17.0, "VZ": 40.0,
        "CMCSA": 42.0,
    },
}

# Flat lookup: symbol → seed price
SEED_PRICES: dict[str, float] = {}
# Flat lookup: symbol → sector name
SYMBOL_SECTOR: dict[str, str] = {}
for _sector, _tickers in SECTORS.items():
    for _sym, _price in _tickers.items():
        SEED_PRICES[_sym] = _price
        SYMBOL_SECTOR[_sym] = _sector

DEFAULT_SEED_PRICE = 100.0

# ── GBM parameters ──────────────────────────────────────────────────────

UPDATE_INTERVAL = 0.5  # seconds between ticks
DT = UPDATE_INTERVAL / (252 * 6.5 * 3600)  # fraction of a trading year

# Annual drift and volatility (per-tick scaled via DT)
MU = 0.08  # ~8% annual drift
SIGMA = 0.20  # ~20% annual volatility

# Intra-sector correlation coefficient
SECTOR_CORRELATION = 0.6

# Event probability per tick (roughly 1 event every ~60 seconds across all tickers)
EVENT_PROBABILITY = 0.002
EVENT_MIN_PCT = 0.02
EVENT_MAX_PCT = 0.05


class GBMSimulator(MarketDataProvider):
    """Simulates market prices using geometric Brownian motion."""

    def __init__(self) -> None:
        self._prices: dict[str, float] = {}
        self._previous: dict[str, float] = {}
        self._latest: dict[str, PriceUpdate] = {}
        self._callbacks: list[Callable[[list[PriceUpdate]], None]] = []
        self._task: asyncio.Task[None] | None = None
        self._running = False

    # ── MarketDataProvider interface ─────────────────────────────────────

    async def start(self, symbols: set[str]) -> None:
        if self._running:
            return
        self._seed(symbols)
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("GBM simulator started for %d symbols", len(self._prices))

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("GBM simulator stopped")

    def get_price(self, symbol: str) -> PriceUpdate | None:
        return self._latest.get(symbol)

    def get_all_prices(self) -> dict[str, PriceUpdate]:
        return dict(self._latest)

    def on_price_update(self, callback: Callable[[list[PriceUpdate]], None]) -> None:
        self._callbacks.append(callback)

    # ── Internal implementation ──────────────────────────────────────────

    def _seed(self, symbols: set[str]) -> None:
        """Initialize prices for all known tickers plus any requested symbols."""
        now = time.time()

        # Start with all built-in tickers
        all_symbols = set(SEED_PRICES.keys()) | symbols

        for sym in all_symbols:
            price = SEED_PRICES.get(sym, DEFAULT_SEED_PRICE)
            self._prices[sym] = price
            self._previous[sym] = price
            self._latest[sym] = PriceUpdate(
                symbol=sym,
                price=price,
                previous_price=price,
                timestamp=now,
                change_pct=0.0,
            )

    async def _run_loop(self) -> None:
        """Main simulation loop: tick every UPDATE_INTERVAL seconds."""
        while self._running:
            start = time.monotonic()
            updates = self._tick()
            for cb in self._callbacks:
                try:
                    cb(updates)
                except Exception:
                    logger.exception("Error in price update callback")

            elapsed = time.monotonic() - start
            await asyncio.sleep(max(0, UPDATE_INTERVAL - elapsed))

    def _tick(self) -> list[PriceUpdate]:
        """Advance all prices by one GBM step with sector correlation."""
        now = time.time()
        sqrt_dt = math.sqrt(DT)
        drift = (MU - 0.5 * SIGMA * SIGMA) * DT

        # Generate one shared random shock per sector
        sector_shocks: dict[str, float] = {
            sector: random.gauss(0, 1) for sector in SECTORS
        }

        updates: list[PriceUpdate] = []

        for sym, current_price in self._prices.items():
            sector = SYMBOL_SECTOR.get(sym)
            z_sector = sector_shocks.get(sector, 0.0) if sector else 0.0
            z_individual = random.gauss(0, 1)

            # Correlated noise: combine sector and individual components
            if sector:
                rho = SECTOR_CORRELATION
                z = rho * z_sector + math.sqrt(1 - rho * rho) * z_individual
            else:
                z = z_individual

            # GBM step: S(t+dt) = S(t) * exp(drift + sigma * sqrt(dt) * Z)
            log_return = drift + SIGMA * sqrt_dt * z

            # Random event: occasional sudden 2-5% jump or drop
            if random.random() < EVENT_PROBABILITY:
                event_pct = random.uniform(EVENT_MIN_PCT, EVENT_MAX_PCT)
                event_sign = random.choice([-1, 1])
                log_return += event_sign * event_pct
                logger.debug(
                    "Event on %s: %+.2f%%", sym, event_sign * event_pct * 100
                )

            new_price = current_price * math.exp(log_return)
            # Clamp to avoid degenerate values (floor at $0.01)
            new_price = max(new_price, 0.01)

            previous = current_price
            change_pct = (new_price - previous) / previous if previous else 0.0

            self._previous[sym] = previous
            self._prices[sym] = new_price

            update = PriceUpdate(
                symbol=sym,
                price=round(new_price, 4),
                previous_price=round(previous, 4),
                timestamp=now,
                change_pct=round(change_pct, 6),
            )
            self._latest[sym] = update
            updates.append(update)

        return updates
