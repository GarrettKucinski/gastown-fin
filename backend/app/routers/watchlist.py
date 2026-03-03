"""Watchlist CRUD endpoints."""

from __future__ import annotations

import re

import asyncpg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.db import DEFAULT_USER_EMAIL, get_pool
from app.price_cache import get_prices

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

_TICKER_RE = re.compile(r"^[A-Z]{1,5}$")


# ── Pydantic models ──────────────────────────────────────────────────


class AddTickerRequest(BaseModel):
    ticker: str

    @field_validator("ticker", mode="before")
    @classmethod
    def normalize_ticker(cls, v: str) -> str:
        v = v.strip().upper()
        if not _TICKER_RE.match(v):
            raise ValueError("Ticker must be 1-5 uppercase letters")
        return v


class WatchlistItem(BaseModel):
    symbol: str
    price: float | None = None
    previous_price: float | None = None
    change_direction: str | None = None


class WatchlistResponse(BaseModel):
    items: list[WatchlistItem]


class AddTickerResponse(BaseModel):
    symbol: str
    added: bool


# ── Helpers ──────────────────────────────────────────────────────────


async def _get_user_id(conn: asyncpg.Connection) -> str:
    uid = await conn.fetchval(
        "SELECT id FROM users WHERE email = $1", DEFAULT_USER_EMAIL
    )
    if uid is None:
        raise HTTPException(status_code=500, detail="Default user not found")
    return uid


def _change_direction(price: float, prev: float | None) -> str | None:
    if prev is None:
        return None
    if price > prev:
        return "up"
    if price < prev:
        return "down"
    return "flat"


# ── Endpoints ────────────────────────────────────────────────────────


@router.get("", response_model=WatchlistResponse)
async def get_watchlist() -> WatchlistResponse:
    """Return watchlist tickers with latest cached prices."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_user_id(conn)
        rows = await conn.fetch(
            "SELECT symbol FROM watchlist WHERE user_id = $1 ORDER BY added_at",
            user_id,
        )
    tickers = [row["symbol"] for row in rows]
    prices = get_prices(tickers)

    items = []
    for ticker in tickers:
        entry = prices.get(ticker)
        items.append(
            WatchlistItem(
                symbol=ticker,
                price=entry.price if entry else None,
                previous_price=entry.previous_price if entry else None,
                change_direction=(
                    _change_direction(entry.price, entry.previous_price)
                    if entry
                    else None
                ),
            )
        )

    return WatchlistResponse(items=items)


@router.post("", response_model=AddTickerResponse, status_code=201)
async def add_ticker(body: AddTickerRequest) -> AddTickerResponse:
    """Add a ticker to the watchlist."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_user_id(conn)
        try:
            await conn.execute(
                "INSERT INTO watchlist (user_id, symbol) VALUES ($1, $2)",
                user_id,
                body.ticker,
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(
                status_code=409,
                detail=f"Ticker {body.ticker} already in watchlist",
            )

    return AddTickerResponse(symbol=body.ticker, added=True)


@router.delete("/{ticker}", status_code=204)
async def remove_ticker(ticker: str) -> None:
    """Remove a ticker from the watchlist."""
    ticker = ticker.strip().upper()
    if not _TICKER_RE.match(ticker):
        raise HTTPException(
            status_code=400, detail="Ticker must be 1-5 uppercase letters"
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_user_id(conn)
        result = await conn.execute(
            "DELETE FROM watchlist WHERE user_id = $1 AND symbol = $2",
            user_id,
            ticker,
        )
        if result == "DELETE 0":
            raise HTTPException(
                status_code=404, detail=f"Ticker {ticker} not in watchlist"
            )
