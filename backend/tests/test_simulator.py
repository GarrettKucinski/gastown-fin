"""Tests for the GBM price simulator."""

import asyncio
import math

import pytest

from app.price_cache import PriceCache, price_cache
from app.simulator import (
    SEED_PRICES,
    UPDATE_INTERVAL,
    PriceSimulator,
    _DEFAULT_SEED,
    _DT,
    _MU,
    _SIGMA,
)


class TestSimulatorSeedPrices:
    def test_seed_prices_are_positive(self):
        for ticker, p in SEED_PRICES.items():
            assert p > 0, f"{ticker} seed price must be positive"

    def test_seed_prices_are_reasonable(self):
        """All seed prices should be between $1 and $10,000."""
        for ticker, p in SEED_PRICES.items():
            assert 1 <= p <= 10_000, f"{ticker}={p} out of range"

    def test_default_seed_is_positive(self):
        assert _DEFAULT_SEED > 0


class TestGBMParameters:
    def test_dt_is_small(self):
        """DT should represent a sub-second interval in trading-year units."""
        assert 0 < _DT < 0.001

    def test_mu_is_reasonable(self):
        """Annual drift should be between -50% and +100%."""
        assert -0.5 <= _MU <= 1.0

    def test_sigma_is_positive(self):
        assert _SIGMA > 0

    def test_update_interval(self):
        assert UPDATE_INTERVAL == 0.5


class TestPriceSimulatorUnit:
    def test_get_price_seeds_from_dict(self):
        sim = PriceSimulator()
        p = sim._get_price("AAPL")
        assert p == SEED_PRICES["AAPL"]

    def test_get_price_unknown_ticker(self):
        sim = PriceSimulator()
        p = sim._get_price("XYZ")
        assert p == _DEFAULT_SEED

    def test_step_returns_positive_price(self):
        sim = PriceSimulator()
        for _ in range(100):
            p = sim._step("AAPL")
            assert p > 0, "Price must never go non-positive"

    def test_step_updates_internal_state(self):
        sim = PriceSimulator()
        initial = sim._get_price("AAPL")
        new_price = sim._step("AAPL")
        stored = sim._prices["AAPL"]
        assert stored == new_price
        # Price should differ from seed after a step (probabilistically always true)
        # but we don't assert inequality since drift+diffusion could yield same price

    def test_step_rounds_to_2_decimals(self):
        sim = PriceSimulator()
        for _ in range(50):
            p = sim._step("MSFT")
            assert p == round(p, 2)

    def test_step_clamps_above_penny(self):
        """Even if GBM produces near-zero, clamp to >= 0.01."""
        sim = PriceSimulator()
        sim._prices["PENNY"] = 0.01
        for _ in range(200):
            p = sim._step("PENNY")
            assert p >= 0.01

    def test_gbm_math_no_event(self):
        """Without random events, GBM should follow exp(drift + diffusion)."""
        import random
        sim = PriceSimulator()
        current = 100.0
        sim._prices["TEST"] = current

        # Fix randomness
        random.seed(42)
        z = random.gauss(0, 1)
        # Reset seed so _step sees same z
        random.seed(42)
        # Temporarily disable events by making probability 0
        import app.simulator as mod
        old_prob = mod._EVENT_PROBABILITY
        mod._EVENT_PROBABILITY = 0.0
        try:
            result = sim._step("TEST")
        finally:
            mod._EVENT_PROBABILITY = old_prob

        drift = (_MU - 0.5 * _SIGMA**2) * _DT
        diffusion = _SIGMA * math.sqrt(_DT) * z
        expected = round(max(current * math.exp(drift + diffusion), 0.01), 2)
        assert result == expected


class TestPriceSimulatorLifecycle:
    def setup_method(self):
        price_cache._prices.clear()

    async def test_start_and_stop(self):
        sim = PriceSimulator()
        task = sim.start()
        assert task is not None
        assert not task.done()

        # Let it run one tick
        await asyncio.sleep(0.1)
        sim.stop()

        # Task should be cancelled
        await asyncio.sleep(0.05)
        assert sim._task is None

    async def test_run_populates_cache(self):
        sim = PriceSimulator()
        sim.start()

        # Wait for initial population
        await asyncio.sleep(0.1)

        for ticker in SEED_PRICES:
            entry = price_cache.get(ticker)
            assert entry is not None, f"{ticker} should be in cache after start"
            assert entry.price > 0

        sim.stop()

    async def test_stop_idempotent(self):
        sim = PriceSimulator()
        sim.stop()  # Should not raise
        sim.stop()  # Still fine
