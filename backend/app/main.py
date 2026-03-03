from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.db import close_db, init_db
from app.routers.watchlist import router as watchlist_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialize DB pool + schema on startup, close on shutdown."""
    await init_db()
    yield
    await close_db()


app = FastAPI(title="Gastown Financial API", lifespan=lifespan)
app.include_router(watchlist_router)


@app.get("/api/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "llm_mock": settings.llm_mock,
    }
