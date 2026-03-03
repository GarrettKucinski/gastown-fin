"""POST /api/chat endpoint — LLM-powered trading assistant.

Loads portfolio context, calls LLM via litellm/OpenRouter, auto-executes
trades and watchlist changes, and stores the conversation in chat_messages.
"""

from __future__ import annotations

import json
import logging
from decimal import Decimal

import litellm
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.db import DEFAULT_USER_EMAIL, get_pool
from app.price_cache import price_cache

logger = logging.getLogger(__name__)

router = APIRouter()

LLM_MODEL = "openrouter/openai/gpt-oss-120b"

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str


class TradeResult(BaseModel):
    symbol: str
    side: str
    quantity: float
    price: float
    total: float


class WatchlistResult(BaseModel):
    symbol: str
    action: str


class ChatResponse(BaseModel):
    message: str
    trades: list[TradeResult]
    watchlist_changes: list[WatchlistResult]


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are FinAlly, an AI trading assistant for a simulated stock portfolio app.

You help users manage their portfolio by providing market insights and executing trades.

## Current Portfolio Context
{portfolio_context}

## Your Capabilities
- Buy and sell stocks (simulated trades)
- Add and remove stocks from the user's watchlist
- Provide market commentary and portfolio analysis

## Response Format
You MUST respond with valid JSON matching this exact schema:
{{
  "message": "Your natural language response to the user",
  "trades": [
    {{"symbol": "AAPL", "side": "buy", "quantity": 10}}
  ],
  "watchlist_changes": [
    {{"symbol": "TSLA", "action": "add"}}
  ]
}}

Rules:
- "trades" array can be empty if no trades are requested
- "watchlist_changes" array can be empty if no watchlist changes are requested
- "side" must be "buy" or "sell"
- "action" must be "add" or "remove"
- Only trade symbols that have prices available in the portfolio context
- For sells, do not exceed the user's current position quantity
- For buys, do not exceed the user's available cash
- Always include a helpful "message" explaining what you did or your analysis
- Respond ONLY with the JSON object, no markdown, no code fences"""

# ---------------------------------------------------------------------------
# Fallback when the LLM produces garbage
# ---------------------------------------------------------------------------

FALLBACK_RESPONSE: dict = {
    "message": "I'm sorry, I had trouble processing your request. Please try again.",
    "trades": [],
    "watchlist_changes": [],
}

# ---------------------------------------------------------------------------
# Portfolio context loader
# ---------------------------------------------------------------------------


async def _load_portfolio_context(conn, user_id) -> dict:
    """Build the full portfolio snapshot the LLM needs for decision-making."""

    # Cash balance
    cash_raw = await conn.fetchval(
        "SELECT cash_balance FROM users_profile WHERE user_id = $1", user_id
    )
    cash = float(cash_raw) if cash_raw else 0.0

    # Open positions with unrealised P&L
    pos_rows = await conn.fetch(
        "SELECT symbol, quantity, avg_cost FROM positions "
        "WHERE user_id = $1 AND quantity > 0",
        user_id,
    )
    positions: list[dict] = []
    total_positions_value = 0.0
    for row in pos_rows:
        symbol = row["symbol"]
        qty = float(row["quantity"])
        avg_cost = float(row["avg_cost"])
        entry = price_cache.get(symbol)
        current_price = entry.price if entry else avg_cost
        market_value = qty * current_price
        unrealized_pnl = (current_price - avg_cost) * qty
        total_positions_value += market_value
        positions.append(
            {
                "symbol": symbol,
                "quantity": qty,
                "avg_cost": round(avg_cost, 2),
                "current_price": round(current_price, 2),
                "market_value": round(market_value, 2),
                "unrealized_pnl": round(unrealized_pnl, 2),
            }
        )

    # Watchlist with live prices
    wl_rows = await conn.fetch(
        "SELECT symbol FROM watchlist WHERE user_id = $1 ORDER BY added_at",
        user_id,
    )
    watchlist: list[dict] = []
    for row in wl_rows:
        symbol = row["symbol"]
        entry = price_cache.get(symbol)
        watchlist.append(
            {
                "symbol": symbol,
                "price": round(entry.price, 2) if entry else None,
                "change_direction": entry.change_direction if entry else None,
            }
        )

    total_value = cash + total_positions_value

    return {
        "cash": round(cash, 2),
        "positions": positions,
        "watchlist": watchlist,
        "total_value": round(total_value, 2),
    }


# ---------------------------------------------------------------------------
# Chat history loader
# ---------------------------------------------------------------------------


async def _load_chat_history(conn, user_id, limit: int = 20) -> list[dict]:
    """Return the last *limit* messages formatted for the LLM.

    Assistant messages are stored as JSON; we extract just the ``message``
    field so the LLM sees a clean conversation thread.
    """
    rows = await conn.fetch(
        "SELECT role, content FROM chat_messages "
        "WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
        user_id,
        limit,
    )
    messages: list[dict] = []
    for row in reversed(rows):  # oldest-first
        content = row["content"]
        if row["role"] == "assistant":
            try:
                content = json.loads(content)["message"]
            except (json.JSONDecodeError, KeyError):
                pass  # legacy plain-text – use as-is
        messages.append({"role": row["role"], "content": content})
    return messages


# ---------------------------------------------------------------------------
# Mock LLM (deterministic, no API key needed)
# ---------------------------------------------------------------------------


def _mock_llm_response(user_message: str) -> str:
    """Return a canned JSON response for ``LLM_MOCK=true``."""
    return json.dumps(
        {
            "message": (
                f'I received your message: "{user_message}". '
                "This is a mock response. In production, I would analyse your "
                "portfolio and provide real trading advice."
            ),
            "trades": [],
            "watchlist_changes": [],
        }
    )


# ---------------------------------------------------------------------------
# LLM integration
# ---------------------------------------------------------------------------


async def _call_llm(messages: list[dict]) -> str:
    """Call the LLM via litellm and return the raw content string."""
    response = await litellm.acompletion(
        model=LLM_MODEL,
        messages=messages,
        api_key=settings.openrouter_api_key,
        response_format={"type": "json_object"},
        temperature=0.7,
        max_tokens=1024,
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("LLM returned empty content")
    return content


def _parse_llm_json(raw: str) -> dict:
    """Parse LLM output into the expected response schema.

    Strips markdown code fences if the model wraps its output in them, then
    validates the required top-level keys.
    """
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [ln for ln in lines[1:] if not ln.strip().startswith("```")]
        text = "\n".join(lines)

    parsed = json.loads(text)

    if "message" not in parsed:
        raise ValueError("Missing 'message' field in LLM response")
    if not isinstance(parsed.get("trades", []), list):
        raise ValueError("'trades' must be a list")
    if not isinstance(parsed.get("watchlist_changes", []), list):
        raise ValueError("'watchlist_changes' must be a list")

    parsed.setdefault("trades", [])
    parsed.setdefault("watchlist_changes", [])
    return parsed


# ---------------------------------------------------------------------------
# Trade execution
# ---------------------------------------------------------------------------


async def _execute_trades(conn, user_id, trades: list[dict]) -> list[dict]:
    """Validate and execute each trade, updating positions and cash."""
    executed: list[dict] = []

    for trade in trades:
        symbol = str(trade.get("symbol", "")).upper()
        side = trade.get("side", "")
        try:
            quantity = float(trade.get("quantity", 0))
        except (TypeError, ValueError):
            continue

        if not symbol or side not in ("buy", "sell") or quantity <= 0:
            continue

        entry = price_cache.get(symbol)
        if not entry:
            continue

        price = entry.price
        total = round(price * quantity, 4)

        if side == "buy":
            cash = float(
                await conn.fetchval(
                    "SELECT cash_balance FROM users_profile WHERE user_id = $1",
                    user_id,
                )
            )
            if cash < total:
                continue  # insufficient funds – skip silently

            await conn.execute(
                "UPDATE users_profile "
                "SET cash_balance = cash_balance - $1, updated_at = now() "
                "WHERE user_id = $2",
                Decimal(str(total)),
                user_id,
            )

            existing = await conn.fetchrow(
                "SELECT quantity, avg_cost FROM positions "
                "WHERE user_id = $1 AND symbol = $2",
                user_id,
                symbol,
            )
            if existing and float(existing["quantity"]) > 0:
                old_qty = float(existing["quantity"])
                old_cost = float(existing["avg_cost"])
                new_qty = old_qty + quantity
                new_avg = ((old_qty * old_cost) + (quantity * price)) / new_qty
                await conn.execute(
                    "UPDATE positions "
                    "SET quantity = $1, avg_cost = $2, updated_at = now() "
                    "WHERE user_id = $3 AND symbol = $4",
                    Decimal(str(new_qty)),
                    Decimal(str(round(new_avg, 4))),
                    user_id,
                    symbol,
                )
            else:
                await conn.execute(
                    "INSERT INTO positions (user_id, symbol, quantity, avg_cost) "
                    "VALUES ($1, $2, $3, $4) "
                    "ON CONFLICT (user_id, symbol) "
                    "DO UPDATE SET quantity = $3, avg_cost = $4, updated_at = now()",
                    user_id,
                    symbol,
                    Decimal(str(quantity)),
                    Decimal(str(round(price, 4))),
                )

        else:  # sell
            existing = await conn.fetchrow(
                "SELECT quantity FROM positions "
                "WHERE user_id = $1 AND symbol = $2",
                user_id,
                symbol,
            )
            if not existing or float(existing["quantity"]) < quantity:
                continue  # can't sell more than you own

            new_qty = float(existing["quantity"]) - quantity

            await conn.execute(
                "UPDATE users_profile "
                "SET cash_balance = cash_balance + $1, updated_at = now() "
                "WHERE user_id = $2",
                Decimal(str(total)),
                user_id,
            )

            await conn.execute(
                "UPDATE positions "
                "SET quantity = $1, updated_at = now() "
                "WHERE user_id = $2 AND symbol = $3",
                Decimal(str(new_qty)),
                user_id,
                symbol,
            )

        # Record the trade
        await conn.execute(
            "INSERT INTO trades (user_id, symbol, side, quantity, price, total) "
            "VALUES ($1, $2, $3, $4, $5, $6)",
            user_id,
            symbol,
            side,
            Decimal(str(quantity)),
            Decimal(str(round(price, 4))),
            Decimal(str(total)),
        )

        executed.append(
            {
                "symbol": symbol,
                "side": side,
                "quantity": quantity,
                "price": round(price, 2),
                "total": round(total, 2),
            }
        )

    return executed


# ---------------------------------------------------------------------------
# Watchlist change execution
# ---------------------------------------------------------------------------


async def _execute_watchlist_changes(
    conn, user_id, changes: list[dict]
) -> list[dict]:
    """Apply watchlist additions / removals."""
    executed: list[dict] = []

    for change in changes:
        symbol = str(change.get("symbol", "")).upper()
        action = change.get("action", "")

        if not symbol or action not in ("add", "remove"):
            continue

        if action == "add":
            await conn.execute(
                "INSERT INTO watchlist (user_id, symbol) "
                "VALUES ($1, $2) "
                "ON CONFLICT (user_id, symbol) DO NOTHING",
                user_id,
                symbol,
            )
        else:
            await conn.execute(
                "DELETE FROM watchlist WHERE user_id = $1 AND symbol = $2",
                user_id,
                symbol,
            )

        executed.append({"symbol": symbol, "action": action})

    return executed


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------


@router.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> dict:
    """Process a user message through the LLM trading assistant.

    1. Load portfolio context  (cash, positions+P&L, watchlist+prices)
    2. Load recent chat history (last 20 messages)
    3. Build prompt and call LLM  (or mock when LLM_MOCK=true)
    4. Parse structured JSON response
    5. Auto-execute trades & watchlist changes
    6. Store conversation + actions in chat_messages
    7. Return response
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        # --- resolve user ------------------------------------------------
        user_id = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1", DEFAULT_USER_EMAIL
        )
        if not user_id:
            raise HTTPException(status_code=500, detail="Default user not found")

        # --- gather context ----------------------------------------------
        portfolio_ctx = await _load_portfolio_context(conn, user_id)
        history = await _load_chat_history(conn, user_id)

        # --- persist the user message ------------------------------------
        await conn.execute(
            "INSERT INTO chat_messages (user_id, role, content) "
            "VALUES ($1, 'user', $2)",
            user_id,
            request.message,
        )

        # --- build LLM messages ------------------------------------------
        system_msg = SYSTEM_PROMPT.format(
            portfolio_context=json.dumps(portfolio_ctx, indent=2)
        )
        llm_messages: list[dict] = [{"role": "system", "content": system_msg}]
        llm_messages.extend(history)
        llm_messages.append({"role": "user", "content": request.message})

        # --- call LLM (or mock) -----------------------------------------
        if settings.llm_mock:
            raw = _mock_llm_response(request.message)
        else:
            try:
                raw = await _call_llm(llm_messages)
            except Exception:
                logger.exception("LLM call failed")
                await _store_assistant(conn, user_id, FALLBACK_RESPONSE)
                return FALLBACK_RESPONSE

        # --- parse with one retry on malformed JSON ----------------------
        parsed = None
        for attempt in range(2):
            try:
                parsed = _parse_llm_json(raw)
                break
            except (json.JSONDecodeError, ValueError):
                if attempt == 0 and not settings.llm_mock:
                    logger.warning("Malformed LLM JSON — retrying")
                    try:
                        raw = await _call_llm(llm_messages)
                    except Exception:
                        logger.exception("LLM retry call failed")
                        break

        if parsed is None:
            logger.error("Failed to parse LLM response after retry")
            await _store_assistant(conn, user_id, FALLBACK_RESPONSE)
            return FALLBACK_RESPONSE

        # --- auto-execute actions ----------------------------------------
        executed_trades = await _execute_trades(
            conn, user_id, parsed["trades"]
        )
        executed_wl = await _execute_watchlist_changes(
            conn, user_id, parsed["watchlist_changes"]
        )

        # --- build final response ----------------------------------------
        response: dict = {
            "message": parsed["message"],
            "trades": executed_trades,
            "watchlist_changes": executed_wl,
        }

        await _store_assistant(conn, user_id, response)
        return response


async def _store_assistant(conn, user_id, response: dict) -> None:
    """Persist the assistant's response (message + actions) as JSON."""
    await conn.execute(
        "INSERT INTO chat_messages (user_id, role, content) "
        "VALUES ($1, 'assistant', $2)",
        user_id,
        json.dumps(response),
    )
