import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.chat import router as chat_router
from app.config import settings
from app.db import DEFAULT_WATCHLIST, close_db, init_db
from app.market.provider import MarketDataProvider
from app.market.simulator import GBMSimulator
from app.routers.portfolio import router as portfolio_router
from app.stream import router as stream_router

logger = logging.getLogger(__name__)

# Module-level provider so other modules can access it
_provider: MarketDataProvider | None = None


def get_market_provider() -> MarketDataProvider:
    """Return the active market data provider."""
    if _provider is None:
        raise RuntimeError("Market data provider not started")
    return _provider


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialize DB pool + schema on startup, start market sim, close on shutdown."""
    global _provider

    await init_db()

    # Start the market data simulator as an in-process background task
    _provider = GBMSimulator()
    await _provider.start(set(DEFAULT_WATCHLIST))
    logger.info("Market data provider started")

    yield

    # Shutdown: stop simulator, then close DB
    if _provider is not None:
        await _provider.stop()
        _provider = None
    await close_db()


app = FastAPI(title="Gastown Financial API", lifespan=lifespan)
app.include_router(stream_router)
app.include_router(portfolio_router)
app.include_router(chat_router)


@app.get("/api/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "llm_mock": settings.llm_mock,
    }
