"""Portfolio API endpoints.

Returns position data for the default user, enriched with live prices
from the shared price cache.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.db import DEFAULT_USER_EMAIL, get_pool
from app.price_cache import price_cache

router = APIRouter()


@router.get("/api/portfolio")
async def get_portfolio() -> dict:
    """Return all positions for the default user with live price data."""
    pool = await get_pool()

    async with pool.acquire() as conn:
        user_id = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1",
            DEFAULT_USER_EMAIL,
        )
        if user_id is None:
            return {"positions": [], "total_value": 0, "cash_balance": 0}

        rows = await conn.fetch(
            """
            SELECT symbol, quantity, avg_cost
            FROM positions
            WHERE user_id = $1 AND quantity > 0
            ORDER BY symbol
            """,
            user_id,
        )

        cash = await conn.fetchval(
            "SELECT cash_balance FROM users_profile WHERE user_id = $1",
            user_id,
        )

    positions = []
    total_market_value = 0.0

    for row in rows:
        symbol = row["symbol"]
        quantity = float(row["quantity"])
        avg_cost = float(row["avg_cost"])

        # Get live price from cache, fall back to avg_cost
        entry = price_cache.get(symbol)
        current_price = entry.price if entry else avg_cost

        market_value = quantity * current_price
        cost_basis = quantity * avg_cost
        pnl = market_value - cost_basis
        pnl_pct = ((current_price - avg_cost) / avg_cost) * 100 if avg_cost else 0

        total_market_value += market_value

        positions.append({
            "symbol": symbol,
            "quantity": quantity,
            "avg_cost": round(avg_cost, 2),
            "current_price": round(current_price, 2),
            "market_value": round(market_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
        })

    # Compute portfolio weight for each position
    for pos in positions:
        pos["weight"] = (
            round(pos["market_value"] / total_market_value, 4)
            if total_market_value > 0
            else 0
        )

    return {
        "positions": positions,
        "total_value": round(total_market_value, 2),
        "cash_balance": round(float(cash or 0), 2),
    }
