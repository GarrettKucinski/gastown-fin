"""In-memory price cache — populated by market data background task."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass(slots=True)
class PriceEntry:
    price: float
    previous_price: float | None = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# Global cache: ticker -> latest price entry
_cache: dict[str, PriceEntry] = {}


def get_price(ticker: str) -> PriceEntry | None:
    """Return the latest cached price for a single ticker."""
    return _cache.get(ticker)


def get_prices(tickers: list[str]) -> dict[str, PriceEntry | None]:
    """Return cached prices for multiple tickers."""
    return {t: _cache.get(t) for t in tickers}


def set_price(
    ticker: str,
    price: float,
    previous_price: float | None = None,
) -> None:
    """Update the cache with a new price (called by market data provider)."""
    _cache[ticker] = PriceEntry(
        price=price,
        previous_price=previous_price,
        timestamp=datetime.now(timezone.utc),
    )
