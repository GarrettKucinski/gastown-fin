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
from app.routers.watchlist import router as watchlist_router
from app.snapshots import PortfolioSnapshotter
from app.stream import router as stream_router

logger = logging.getLogger(__name__)

# Module-level provider so other modules can access it
_provider: MarketDataProvider | None = None


def get_market_provider() -> MarketDataProvider:
    """Return the active market data provider."""
    if _provider is None:
        raise RuntimeError("Market data provider not started")
    return _provider


def _create_market_data_provider():
    """Select the market data provider based on configuration.

    Uses Massive (Polygon.io) when MASSIVE_API_KEY is set and non-empty,
    otherwise falls back to the built-in GBM simulator.
    """
    if settings.massive_api_key:
        from app.massive import MassiveClient

        logger.info(
            "Using Massive (Polygon.io) provider, poll_interval=%.1fs",
            settings.massive_poll_interval,
        )
        return MassiveClient(
            api_key=settings.massive_api_key,
            poll_interval=settings.massive_poll_interval,
        )

    logger.info("Using simulated price provider (GBM)")
    return GBMSimulator()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialize DB pool + schema on startup, start market data provider and snapshotter, close on shutdown."""
    global _provider

    await init_db()

    # Start the market data provider (Massive or GBM simulator)
    _provider = _create_market_data_provider()
    await _provider.start(set(DEFAULT_WATCHLIST))
    logger.info("Market data provider started")

    # Start portfolio snapshotter
    snapshotter = PortfolioSnapshotter()
    snapshotter.start()

    yield

    # Shutdown: stop snapshotter, provider, then close DB
    snapshotter.stop()
    if _provider is not None:
        await _provider.stop()
        _provider = None
    await close_db()


app = FastAPI(title="Gastown Financial API", lifespan=lifespan)
app.include_router(stream_router)
app.include_router(portfolio_router)
app.include_router(chat_router)
app.include_router(watchlist_router)


@app.get("/api/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "llm_mock": settings.llm_mock,
    }
