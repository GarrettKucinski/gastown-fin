"""Tests for the PriceCache and module-level convenience functions."""

import asyncio

import pytest

from app.price_cache import PriceCache, PriceEntry, get_price, get_prices, price_cache


class TestPriceEntry:
    def test_fields(self):
        e = PriceEntry(
            ticker="AAPL", price=150.0, previous_price=148.0,
            timestamp=1000.0, change_direction="up",
        )
        assert e.ticker == "AAPL"
        assert e.price == 150.0
        assert e.previous_price == 148.0
        assert e.change_direction == "up"


class TestPriceCache:
    def test_update_first_price_is_flat(self):
        """First update has no previous price, so previous_price == price and direction is flat."""
        cache = PriceCache()
        entry = cache.update("AAPL", 150.0)
        assert entry.price == 150.0
        assert entry.previous_price == 150.0
        assert entry.change_direction == "flat"

    def test_update_price_up(self):
        cache = PriceCache()
        cache.update("AAPL", 100.0)
        entry = cache.update("AAPL", 105.0)
        assert entry.change_direction == "up"
        assert entry.previous_price == 100.0

    def test_update_price_down(self):
        cache = PriceCache()
        cache.update("AAPL", 100.0)
        entry = cache.update("AAPL", 95.0)
        assert entry.change_direction == "down"
        assert entry.previous_price == 100.0

    def test_update_price_flat(self):
        cache = PriceCache()
        cache.update("AAPL", 100.0)
        entry = cache.update("AAPL", 100.0)
        assert entry.change_direction == "flat"

    def test_get_returns_none_for_unknown(self):
        cache = PriceCache()
        assert cache.get("ZZZZ") is None

    def test_get_returns_entry(self):
        cache = PriceCache()
        cache.update("MSFT", 300.0)
        entry = cache.get("MSFT")
        assert entry is not None
        assert entry.price == 300.0

    def test_snapshot_empty(self):
        cache = PriceCache()
        assert cache.snapshot() == []

    def test_snapshot_returns_all(self):
        cache = PriceCache()
        cache.update("AAPL", 150.0)
        cache.update("MSFT", 300.0)
        snap = cache.snapshot()
        tickers = {e.ticker for e in snap}
        assert tickers == {"AAPL", "MSFT"}

    def test_timestamp_is_set(self):
        cache = PriceCache()
        entry = cache.update("AAPL", 100.0)
        assert entry.timestamp > 0

    async def test_notify_wakes_waiter(self):
        cache = PriceCache()
        notified = asyncio.Event()

        async def waiter():
            await cache.wait_for_update()
            notified.set()

        task = asyncio.create_task(waiter())
        await asyncio.sleep(0.01)
        assert not notified.is_set()

        await cache.notify()
        await asyncio.sleep(0.01)
        assert notified.is_set()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


class TestModuleLevelFunctions:
    """Tests for get_price / get_prices that delegate to the singleton."""

    def setup_method(self):
        # Reset the singleton's internal state
        price_cache._prices.clear()

    def test_get_price_none(self):
        assert get_price("ZZZZ") is None

    def test_get_price_after_update(self):
        price_cache.update("NVDA", 500.0)
        entry = get_price("NVDA")
        assert entry is not None
        assert entry.price == 500.0

    def test_get_prices_multiple(self):
        price_cache.update("AAPL", 150.0)
        price_cache.update("MSFT", 300.0)
        result = get_prices(["AAPL", "MSFT", "ZZZZ"])
        assert result["AAPL"].price == 150.0
        assert result["MSFT"].price == 300.0
        assert result["ZZZZ"] is None
