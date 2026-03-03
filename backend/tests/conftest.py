"""Shared test configuration."""

import pytest


@pytest.fixture(autouse=True)
def _reset_price_cache():
    """Reset the global price cache before each test."""
    from app.price_cache import price_cache
    price_cache._prices.clear()
    yield
    price_cache._prices.clear()
