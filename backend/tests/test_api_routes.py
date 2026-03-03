"""API route tests: status codes, response shapes, error handling.

Uses httpx AsyncClient with FastAPI's TestClient pattern.
Mocks DB and simulator to test HTTP layer in isolation.
"""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.price_cache import price_cache


USER_ID = uuid.uuid4()
TRADE_ID = uuid.uuid4()


def _make_pool(conn):
    """MagicMock pool so .acquire() returns async CM synchronously."""
    pool = MagicMock()
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=conn)
    ctx.__aexit__ = AsyncMock(return_value=False)
    pool.acquire.return_value = ctx
    return pool


def _make_conn():
    """MagicMock conn so .transaction() returns async CM synchronously."""
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


def _patch_pool(target, pool):
    """Patch get_pool as an AsyncMock returning pool."""
    return patch(target, new_callable=AsyncMock, return_value=pool)


@pytest.fixture
def app():
    """Import the FastAPI app with lifespan disabled for testing."""
    from contextlib import asynccontextmanager
    from collections.abc import AsyncIterator
    from fastapi import FastAPI
    from app.chat import router as chat_router
    from app.config import settings
    from app.routers.portfolio import router as portfolio_router
    from app.routers.watchlist import router as watchlist_router
    from app.stream import router as stream_router

    @asynccontextmanager
    async def noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield

    test_app = FastAPI(title="Test API", lifespan=noop_lifespan)
    test_app.include_router(stream_router)
    test_app.include_router(portfolio_router)
    test_app.include_router(watchlist_router)
    test_app.include_router(chat_router)

    @test_app.get("/api/health")
    async def health_check() -> dict:
        return {"status": "ok", "llm_mock": settings.llm_mock}

    return test_app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


class TestHealthEndpoint:
    async def test_health_returns_200(self, client):
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "llm_mock" in data

    async def test_health_response_shape(self, client):
        resp = await client.get("/api/health")
        data = resp.json()
        assert set(data.keys()) == {"status", "llm_mock"}


# ---------------------------------------------------------------------------
# Portfolio endpoints
# ---------------------------------------------------------------------------


class TestPortfolioRoutes:
    async def test_get_portfolio_200(self, client):
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetchrow.return_value = {"cash_balance": Decimal("10000.00")}
        conn.fetch.return_value = []
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            resp = await client.get("/api/portfolio")
        assert resp.status_code == 200
        data = resp.json()
        assert "cash_balance" in data
        assert "total_value" in data
        assert "positions" in data
        assert isinstance(data["positions"], list)

    async def test_trade_buy_201(self, client):
        price_cache.update("AAPL", 150.0)

        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        # fetchrow calls: 1) cash check, 2) position check, 3) trade insert
        conn.fetchrow.side_effect = [
            {"cash_balance": Decimal("10000.00")},  # cash check in _execute_buy
            None,  # no existing position
            {"id": TRADE_ID, "executed_at": "2026-01-01T00:00:00"},  # trade insert
        ]
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            resp = await client.post("/api/portfolio/trade", json={
                "ticker": "AAPL", "side": "buy", "quantity": 5,
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["symbol"] == "AAPL"
        assert data["side"] == "buy"
        assert data["quantity"] == 5.0
        assert "trade_id" in data
        assert "price" in data
        assert "total" in data

    async def test_trade_no_price_400(self, client):
        """Trading a ticker with no cached price returns 400."""
        resp = await client.post("/api/portfolio/trade", json={
            "ticker": "ZZZZ", "side": "buy", "quantity": 1,
        })
        assert resp.status_code == 400

    async def test_trade_invalid_side_422(self, client):
        resp = await client.post("/api/portfolio/trade", json={
            "ticker": "AAPL", "side": "hold", "quantity": 1,
        })
        assert resp.status_code == 422

    async def test_trade_zero_quantity_422(self, client):
        resp = await client.post("/api/portfolio/trade", json={
            "ticker": "AAPL", "side": "buy", "quantity": 0,
        })
        assert resp.status_code == 422

    async def test_trade_missing_ticker_422(self, client):
        resp = await client.post("/api/portfolio/trade", json={
            "side": "buy", "quantity": 1,
        })
        assert resp.status_code == 422

    async def test_portfolio_history_200(self, client):
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetch.return_value = []
        pool = _make_pool(conn)

        with _patch_pool("app.routers.portfolio.get_pool", pool):
            resp = await client.get("/api/portfolio/history")
        assert resp.status_code == 200
        data = resp.json()
        assert "snapshots" in data
        assert isinstance(data["snapshots"], list)


# ---------------------------------------------------------------------------
# Watchlist endpoints
# ---------------------------------------------------------------------------


class TestWatchlistRoutes:
    async def test_get_watchlist_200(self, client):
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.fetch.return_value = [
            {"symbol": "AAPL"},
            {"symbol": "MSFT"},
        ]
        pool = _make_pool(conn)

        with _patch_pool("app.routers.watchlist.get_pool", pool):
            resp = await client.get("/api/watchlist")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert len(data["items"]) == 2
        assert data["items"][0]["symbol"] == "AAPL"

    async def test_add_ticker_201(self, client):
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        pool = _make_pool(conn)

        with _patch_pool("app.routers.watchlist.get_pool", pool):
            resp = await client.post("/api/watchlist", json={"ticker": "NVDA"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["symbol"] == "NVDA"
        assert data["added"] is True

    async def test_add_invalid_ticker_422(self, client):
        resp = await client.post("/api/watchlist", json={"ticker": "123"})
        assert resp.status_code == 422

    async def test_delete_ticker_204(self, client):
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.execute.return_value = "DELETE 1"
        pool = _make_pool(conn)

        with _patch_pool("app.routers.watchlist.get_pool", pool):
            resp = await client.delete("/api/watchlist/AAPL")
        assert resp.status_code == 204

    async def test_delete_missing_ticker_404(self, client):
        conn = _make_conn()
        conn.fetchval.return_value = USER_ID
        conn.execute.return_value = "DELETE 0"
        pool = _make_pool(conn)

        with _patch_pool("app.routers.watchlist.get_pool", pool):
            resp = await client.delete("/api/watchlist/ZZZZ")
        assert resp.status_code == 404

    async def test_delete_invalid_ticker_400(self, client):
        resp = await client.delete("/api/watchlist/123456")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Chat endpoint
# ---------------------------------------------------------------------------


class TestChatRoutes:
    async def test_chat_mock_mode_200(self, client):
        """In mock mode, chat returns a deterministic response."""
        conn = _make_conn()
        conn.fetchval.side_effect = [USER_ID, Decimal("10000.00")]
        conn.fetch.side_effect = [
            [],  # positions
            [],  # watchlist
            [],  # chat history
        ]
        pool = _make_pool(conn)

        with (
            _patch_pool("app.chat.get_pool", pool),
            patch("app.chat.settings") as mock_settings,
        ):
            mock_settings.llm_mock = True
            mock_settings.openrouter_api_key = ""
            resp = await client.post("/api/chat", json={"message": "hello"})

        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "trades" in data
        assert "watchlist_changes" in data

    async def test_chat_empty_message_422(self, client):
        """Empty message should fail validation (FastAPI requires non-empty body)."""
        resp = await client.post("/api/chat", json={})
        assert resp.status_code == 422

    async def test_chat_missing_body_422(self, client):
        resp = await client.post("/api/chat")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 404 for unknown routes
# ---------------------------------------------------------------------------


class TestNotFound:
    async def test_unknown_route_404(self, client):
        resp = await client.get("/api/nonexistent")
        assert resp.status_code == 404
