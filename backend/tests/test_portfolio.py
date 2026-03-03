"""Tests for portfolio API: trade execution, P&L, edge cases.

Uses mocked asyncpg pool to avoid DB dependency.
"""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest

from app.price_cache import price_cache


# ---------------------------------------------------------------------------
# Helpers for mocking asyncpg
# ---------------------------------------------------------------------------


def _make_pool(conn):
    """Create a mock pool that yields the given mock connection.

    Uses MagicMock so pool.acquire() returns the context manager synchronously
    (asyncpg's pool.acquire() returns an async CM, not a coroutine).
    """
    pool = MagicMock()
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=conn)
    ctx.__aexit__ = AsyncMock(return_value=False)
    pool.acquire.return_value = ctx
    return pool


def _make_conn():
    """Create a mock asyncpg connection with transaction support.

    Uses MagicMock base so .transaction() returns an async CM synchronously,
    with async methods explicitly set for DB operations.
    """
    conn = MagicMock()
    conn.fetchval = AsyncMock()
    conn.fetchrow = AsyncMock()
    conn.fetch = AsyncMock()
    conn.execute = AsyncMock()

    tx = AsyncMock()
    tx.__aenter__ = AsyncMock(return_value=tx)
    tx.__aexit__ = AsyncMock(return_value=False)
    conn.transaction.return_value = tx

    return conn


USER_ID = uuid.uuid4()


def _patch_pool(target, pool):
    """Patch get_pool as an AsyncMock that returns the given pool."""
    return patch(target, new_callable=AsyncMock, return_value=pool)


# ---------------------------------------------------------------------------
# Portfolio GET tests
# ---------------------------------------------------------------------------


class TestGetPortfolio:
    @pytest.fixture
    def conn_with_positions(self):
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.return_value = {"cash_balance": Decimal("5000.00")}
        conn.fetch.return_value = [
            {"symbol": "AAPL", "quantity": Decimal("10"), "avg_cost": Decimal("150.00")},
            {"symbol": "MSFT", "quantity": Decimal("5"), "avg_cost": Decimal("300.00")},
        ]
        return conn

    async def test_portfolio_with_prices(self, conn_with_positions):
        price_cache.update("AAPL", 160.0)
        price_cache.update("MSFT", 320.0)

        pool = _make_pool(conn_with_positions)
        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from app.routers.portfolio import get_portfolio
            result = await get_portfolio()

        assert result.cash_balance == 5000.00
        assert len(result.positions) == 2

        aapl = next(p for p in result.positions if p.symbol == "AAPL")
        assert aapl.quantity == 10.0
        assert aapl.current_price == 160.0
        assert aapl.market_value == 1600.0
        # unrealized P&L: (160-150)*10 = 100
        assert aapl.unrealized_pnl == 100.0

        msft = next(p for p in result.positions if p.symbol == "MSFT")
        assert msft.market_value == 1600.0
        # unrealized P&L: (320-300)*5 = 100
        assert msft.unrealized_pnl == 100.0

        # total = cash + positions
        assert result.total_value == 5000.00 + 1600.0 + 1600.0

    async def test_portfolio_without_prices(self):
        """When price cache has no data, current_price/market_value are None."""
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.return_value = {"cash_balance": Decimal("10000.00")}
        conn.fetch.return_value = [
            {"symbol": "ZZZZ", "quantity": Decimal("10"), "avg_cost": Decimal("50.00")},
        ]
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from app.routers.portfolio import get_portfolio
            result = await get_portfolio()

        pos = result.positions[0]
        assert pos.current_price is None
        assert pos.market_value is None
        assert pos.unrealized_pnl is None

    async def test_portfolio_empty_positions(self):
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.return_value = {"cash_balance": Decimal("10000.00")}
        conn.fetch.return_value = []
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from app.routers.portfolio import get_portfolio
            result = await get_portfolio()

        assert result.positions == []
        assert result.cash_balance == 10000.0
        assert result.total_value == 10000.0


# ---------------------------------------------------------------------------
# Trade execution edge cases
# ---------------------------------------------------------------------------


class TestExecuteBuy:
    async def test_buy_insufficient_cash(self):
        """Buying more than cash allows should return 400."""
        price_cache.update("AAPL", 150.0)

        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.side_effect = [
            # cash check
            {"cash_balance": Decimal("100.00")},
        ]
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from fastapi import HTTPException
            from app.routers.portfolio import execute_trade, TradeRequest
            req = TradeRequest(ticker="AAPL", side="buy", quantity=10.0)
            with pytest.raises(HTTPException) as exc_info:
                await execute_trade(req)
            assert exc_info.value.status_code == 400
            assert "Insufficient cash" in exc_info.value.detail


class TestExecuteSell:
    async def test_sell_no_position(self):
        """Selling a ticker you don't own should return 400."""
        price_cache.update("AAPL", 150.0)

        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.return_value = None  # no position
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from fastapi import HTTPException
            from app.routers.portfolio import execute_trade, TradeRequest
            req = TradeRequest(ticker="AAPL", side="sell", quantity=5.0)
            with pytest.raises(HTTPException) as exc_info:
                await execute_trade(req)
            assert exc_info.value.status_code == 400
            assert "No position" in exc_info.value.detail

    async def test_sell_more_than_owned(self):
        """Selling more shares than held should return 400."""
        price_cache.update("AAPL", 150.0)

        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.return_value = {"quantity": Decimal("5")}
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from fastapi import HTTPException
            from app.routers.portfolio import execute_trade, TradeRequest
            req = TradeRequest(ticker="AAPL", side="sell", quantity=10.0)
            with pytest.raises(HTTPException) as exc_info:
                await execute_trade(req)
            assert exc_info.value.status_code == 400
            assert "Insufficient shares" in exc_info.value.detail

    async def test_sell_no_price_available(self):
        """Selling when no cached price should return 400."""
        conn = _make_conn()
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from fastapi import HTTPException
            from app.routers.portfolio import execute_trade, TradeRequest
            req = TradeRequest(ticker="ZZZZ", side="sell", quantity=1.0)
            with pytest.raises(HTTPException) as exc_info:
                await execute_trade(req)
            assert exc_info.value.status_code == 400
            assert "No price available" in exc_info.value.detail


class TestTradeRequestValidation:
    def test_ticker_normalization(self):
        from app.routers.portfolio import TradeRequest
        req = TradeRequest(ticker="  aapl  ", side="buy", quantity=1.0)
        assert req.ticker == "AAPL"

    def test_invalid_side(self):
        from app.routers.portfolio import TradeRequest
        with pytest.raises(ValueError):
            TradeRequest(ticker="AAPL", side="hold", quantity=1.0)

    def test_zero_quantity(self):
        from app.routers.portfolio import TradeRequest
        with pytest.raises(ValueError):
            TradeRequest(ticker="AAPL", side="buy", quantity=0.0)

    def test_negative_quantity(self):
        from app.routers.portfolio import TradeRequest
        with pytest.raises(ValueError):
            TradeRequest(ticker="AAPL", side="buy", quantity=-5.0)

    def test_long_ticker(self):
        from app.routers.portfolio import TradeRequest
        with pytest.raises(ValueError):
            TradeRequest(ticker="TOOLONG", side="buy", quantity=1.0)


# ---------------------------------------------------------------------------
# P&L calculation tests
# ---------------------------------------------------------------------------


class TestPnlCalculations:
    async def test_unrealized_pnl_positive(self):
        """Bought at 100, now at 120 → P&L = +20 per share."""
        price_cache.update("TEST", 120.0)

        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.return_value = {"cash_balance": Decimal("5000.00")}
        conn.fetch.return_value = [
            {"symbol": "TEST", "quantity": Decimal("10"), "avg_cost": Decimal("100.00")},
        ]
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from app.routers.portfolio import get_portfolio
            result = await get_portfolio()

        pos = result.positions[0]
        assert pos.unrealized_pnl == 200.0  # (120-100)*10
        assert pos.unrealized_pnl_pct == 20.0  # 200/1000 * 100

    async def test_unrealized_pnl_negative(self):
        """Bought at 100, now at 80 → P&L = -20 per share (loss)."""
        price_cache.update("TEST", 80.0)

        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.return_value = {"cash_balance": Decimal("5000.00")}
        conn.fetch.return_value = [
            {"symbol": "TEST", "quantity": Decimal("10"), "avg_cost": Decimal("100.00")},
        ]
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            from app.routers.portfolio import get_portfolio
            result = await get_portfolio()

        pos = result.positions[0]
        assert pos.unrealized_pnl == -200.0
        assert pos.unrealized_pnl_pct == -20.0
