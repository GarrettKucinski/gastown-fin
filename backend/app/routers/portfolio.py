"""Portfolio API endpoints: positions, trading, and history."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import asyncpg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.db import DEFAULT_USER_EMAIL, get_pool
from app.price_cache import price_cache

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


# ── Pydantic models ──────────────────────────────────────────────────


class PositionItem(BaseModel):
    symbol: str
    quantity: float
    avg_cost: float
    current_price: float | None
    market_value: float | None
    unrealized_pnl: float | None
    unrealized_pnl_pct: float | None


class PortfolioResponse(BaseModel):
    cash_balance: float
    total_value: float
    positions: list[PositionItem]


class TradeRequest(BaseModel):
    ticker: str
    side: str
    quantity: float

    @field_validator("ticker", mode="before")
    @classmethod
    def normalize_ticker(cls, v: object) -> str:
        if not isinstance(v, str):
            raise ValueError("Ticker must be a string")
        v = v.strip().upper()
        if not v or len(v) > 5:
            raise ValueError("Ticker must be 1-5 characters")
        return v

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: str) -> str:
        v = v.lower()
        if v not in ("buy", "sell"):
            raise ValueError("Side must be 'buy' or 'sell'")
        return v

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Quantity must be positive")
        return v


class TradeResponse(BaseModel):
    trade_id: str
    symbol: str
    side: str
    quantity: float
    price: float
    total: float
    executed_at: datetime


class SnapshotItem(BaseModel):
    total_value: float
    cash_balance: float
    snapshot_at: datetime


class HistoryResponse(BaseModel):
    snapshots: list[SnapshotItem]


# ── Helpers ──────────────────────────────────────────────────────────


async def _get_user_id(conn: asyncpg.Connection) -> str:
    uid = await conn.fetchval(
        "SELECT id FROM users WHERE email = $1", DEFAULT_USER_EMAIL
    )
    if uid is None:
        raise HTTPException(status_code=500, detail="Default user not found")
    return uid


# ── Endpoints ────────────────────────────────────────────────────────


@router.get("", response_model=PortfolioResponse)
async def get_portfolio() -> PortfolioResponse:
    """Return current positions, cash balance, total value, and unrealized P&L."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_user_id(conn)

        cash_row = await conn.fetchrow(
            "SELECT cash_balance FROM users_profile WHERE user_id = $1", user_id
        )
        if cash_row is None:
            raise HTTPException(status_code=500, detail="User profile not found")
        cash_balance = float(cash_row["cash_balance"])

        rows = await conn.fetch(
            "SELECT symbol, quantity, avg_cost FROM positions WHERE user_id = $1 ORDER BY symbol",
            user_id,
        )

    positions: list[PositionItem] = []
    positions_value = 0.0

    for row in rows:
        symbol = row["symbol"]
        quantity = float(row["quantity"])
        avg_cost = float(row["avg_cost"])

        entry = price_cache.get(symbol)
        current_price = entry.price if entry else None

        if current_price is not None:
            market_value = quantity * current_price
            cost_basis = quantity * avg_cost
            unrealized_pnl = market_value - cost_basis
            unrealized_pnl_pct = (
                (unrealized_pnl / cost_basis * 100) if cost_basis != 0 else 0.0
            )
            positions_value += market_value
        else:
            market_value = None
            unrealized_pnl = None
            unrealized_pnl_pct = None

        positions.append(
            PositionItem(
                symbol=symbol,
                quantity=quantity,
                avg_cost=avg_cost,
                current_price=current_price,
                market_value=round(market_value, 4) if market_value is not None else None,
                unrealized_pnl=round(unrealized_pnl, 4) if unrealized_pnl is not None else None,
                unrealized_pnl_pct=round(unrealized_pnl_pct, 2) if unrealized_pnl_pct is not None else None,
            )
        )

    total_value = cash_balance + positions_value

    return PortfolioResponse(
        cash_balance=round(cash_balance, 2),
        total_value=round(total_value, 2),
        positions=positions,
    )


@router.post("/trade", response_model=TradeResponse, status_code=201)
async def execute_trade(body: TradeRequest) -> TradeResponse:
    """Execute a market order at the current cached price."""
    entry = price_cache.get(body.ticker)
    if entry is None:
        raise HTTPException(
            status_code=400,
            detail=f"No price available for {body.ticker}",
        )

    fill_price = entry.price
    total = fill_price * body.quantity

    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_user_id(conn)

        async with conn.transaction():
            if body.side == "buy":
                await _execute_buy(conn, user_id, body.ticker, body.quantity, fill_price, total)
            else:
                await _execute_sell(conn, user_id, body.ticker, body.quantity, fill_price, total)

            trade_row = await conn.fetchrow(
                """
                INSERT INTO trades (user_id, symbol, side, quantity, price, total)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, executed_at
                """,
                user_id,
                body.ticker,
                body.side,
                Decimal(str(body.quantity)),
                Decimal(str(fill_price)),
                Decimal(str(total)),
            )

    return TradeResponse(
        trade_id=str(trade_row["id"]),
        symbol=body.ticker,
        side=body.side,
        quantity=body.quantity,
        price=fill_price,
        total=round(total, 4),
        executed_at=trade_row["executed_at"],
    )


async def _execute_buy(
    conn: asyncpg.Connection,
    user_id: str,
    symbol: str,
    quantity: float,
    price: float,
    total: float,
) -> None:
    """Validate cash and update position for a buy order."""
    cash_row = await conn.fetchrow(
        "SELECT cash_balance FROM users_profile WHERE user_id = $1 FOR UPDATE",
        user_id,
    )
    cash_balance = float(cash_row["cash_balance"])

    if total > cash_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient cash: need ${total:.2f}, have ${cash_balance:.2f}",
        )

    await conn.execute(
        "UPDATE users_profile SET cash_balance = cash_balance - $1, updated_at = now() WHERE user_id = $2",
        Decimal(str(total)),
        user_id,
    )

    existing = await conn.fetchrow(
        "SELECT quantity, avg_cost FROM positions WHERE user_id = $1 AND symbol = $2 FOR UPDATE",
        user_id,
        symbol,
    )

    if existing:
        old_qty = float(existing["quantity"])
        old_avg = float(existing["avg_cost"])
        new_qty = old_qty + quantity
        new_avg = ((old_qty * old_avg) + (quantity * price)) / new_qty
        await conn.execute(
            "UPDATE positions SET quantity = $1, avg_cost = $2, updated_at = now() WHERE user_id = $3 AND symbol = $4",
            Decimal(str(new_qty)),
            Decimal(str(new_avg)),
            user_id,
            symbol,
        )
    else:
        await conn.execute(
            "INSERT INTO positions (user_id, symbol, quantity, avg_cost) VALUES ($1, $2, $3, $4)",
            user_id,
            symbol,
            Decimal(str(quantity)),
            Decimal(str(price)),
        )


async def _execute_sell(
    conn: asyncpg.Connection,
    user_id: str,
    symbol: str,
    quantity: float,
    price: float,
    total: float,
) -> None:
    """Validate shares and update position for a sell order."""
    existing = await conn.fetchrow(
        "SELECT quantity FROM positions WHERE user_id = $1 AND symbol = $2 FOR UPDATE",
        user_id,
        symbol,
    )

    if existing is None:
        raise HTTPException(
            status_code=400,
            detail=f"No position in {symbol} to sell",
        )

    held = float(existing["quantity"])
    if quantity > held:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient shares: want to sell {quantity}, hold {held}",
        )

    new_qty = held - quantity
    if new_qty == 0:
        await conn.execute(
            "DELETE FROM positions WHERE user_id = $1 AND symbol = $2",
            user_id,
            symbol,
        )
    else:
        await conn.execute(
            "UPDATE positions SET quantity = $1, updated_at = now() WHERE user_id = $2 AND symbol = $3",
            Decimal(str(new_qty)),
            user_id,
            symbol,
        )

    await conn.execute(
        "UPDATE users_profile SET cash_balance = cash_balance + $1, updated_at = now() WHERE user_id = $2",
        Decimal(str(total)),
        user_id,
    )


@router.get("/history", response_model=HistoryResponse)
async def get_portfolio_history() -> HistoryResponse:
    """Return portfolio snapshots for the P&L chart."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_user_id(conn)

        rows = await conn.fetch(
            """
            SELECT total_value, cash_balance, snapshot_at
            FROM portfolio_snapshots
            WHERE user_id = $1
            ORDER BY snapshot_at ASC
            """,
            user_id,
        )

    snapshots = [
        SnapshotItem(
            total_value=float(row["total_value"]),
            cash_balance=float(row["cash_balance"]),
            snapshot_at=row["snapshot_at"],
        )
        for row in rows
    ]

    return HistoryResponse(snapshots=snapshots)
