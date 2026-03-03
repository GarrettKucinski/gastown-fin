"""Abstract market data provider interface."""

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PriceUpdate:
    """A single price tick for a symbol."""

    symbol: str
    price: float
    previous_price: float
    timestamp: float
    change_pct: float


class MarketDataProvider(ABC):
    """Abstract interface for market data sources.

    Implementations must provide price data for a set of watched symbols.
    The provider runs as an in-process background task, invoking registered
    callbacks on each price update batch.
    """

    @abstractmethod
    async def start(self, symbols: set[str]) -> None:
        """Begin producing price updates for the given symbols."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop the provider and release resources."""

    @abstractmethod
    def get_price(self, symbol: str) -> PriceUpdate | None:
        """Return the latest price for a symbol, or None if unknown."""

    @abstractmethod
    def get_all_prices(self) -> dict[str, PriceUpdate]:
        """Return latest prices for all tracked symbols."""

    @abstractmethod
    def on_price_update(self, callback: Callable[[list[PriceUpdate]], None]) -> None:
        """Register a callback invoked with each batch of price updates."""
