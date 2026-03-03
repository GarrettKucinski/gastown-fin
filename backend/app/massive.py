"""Massive (Polygon.io) REST API client for real-time market data.

Polls the Polygon.io snapshot endpoint at a configurable interval and
writes prices to the shared PriceCache.  Drop-in replacement for
PriceSimulator — same start()/stop() interface.

Selected when MASSIVE_API_KEY env var is set and non-empty.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.price_cache import price_cache
from app.simulator import SEED_PRICES

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.polygon.io"
_SNAPSHOT_PATH = "/v2/snapshot/locale/us/markets/stocks/tickers"


class MassiveClient:
    """Polygon.io REST poller that writes to the shared PriceCache.

    Conforms to the same interface as PriceSimulator (start / stop).
    """

    def __init__(
        self,
        api_key: str,
        poll_interval: float = 15.0,
        tickers: list[str] | None = None,
    ) -> None:
        self._api_key = api_key
        self._poll_interval = poll_interval
        self._tickers = tickers or list(SEED_PRICES.keys())
        self._task: asyncio.Task[None] | None = None
        self._client: httpx.AsyncClient | None = None

    async def _fetch_prices(self) -> dict[str, float]:
        """Fetch latest prices for all watched tickers from Polygon.io.

        Returns a dict mapping ticker -> last trade price.
        """
        assert self._client is not None

        params = {
            "tickers": ",".join(self._tickers),
            "apiKey": self._api_key,
        }

        resp = await self._client.get(
            f"{_BASE_URL}{_SNAPSHOT_PATH}",
            params=params,
        )
        resp.raise_for_status()

        data = resp.json()
        prices: dict[str, float] = {}

        for ticker_data in data.get("tickers", []):
            ticker = ticker_data.get("ticker", "")
            last_trade = ticker_data.get("lastTrade", {})
            price = last_trade.get("p")

            if ticker and price is not None:
                prices[ticker] = round(float(price), 2)

        return prices

    async def run(self) -> None:
        """Poll Polygon.io in a loop and update the price cache."""
        self._client = httpx.AsyncClient(timeout=10.0)

        try:
            while True:
                try:
                    prices = await self._fetch_prices()

                    if prices:
                        for ticker, price in prices.items():
                            price_cache.update(ticker, price)
                        await price_cache.notify()
                        logger.debug(
                            "Massive: updated %d tickers", len(prices)
                        )
                    else:
                        logger.warning("Massive: empty response from API")

                except httpx.HTTPStatusError as exc:
                    logger.error(
                        "Massive API error: %s %s",
                        exc.response.status_code,
                        exc.response.text[:200],
                    )
                except httpx.RequestError as exc:
                    logger.error("Massive request failed: %s", exc)

                await asyncio.sleep(self._poll_interval)
        finally:
            await self._client.aclose()
            self._client = None

    def start(self) -> asyncio.Task[None]:
        """Start the poller as a background task."""
        self._task = asyncio.create_task(self.run())
        return self._task

    def stop(self) -> None:
        """Cancel the background polling task."""
        if self._task is not None:
            self._task.cancel()
            self._task = None
