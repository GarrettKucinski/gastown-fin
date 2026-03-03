"""Chat API endpoint: LLM-powered trading assistant."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.db import DEFAULT_USER_EMAIL, get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

SYSTEM_PROMPT = (
    "You are a helpful trading assistant for Gastown Finance. "
    "You help users understand their portfolio, make trading decisions, "
    "and answer questions about the market. Keep responses concise and professional. "
    "When you execute trades or modify watchlists, clearly state the action taken."
)

MOCK_RESPONSES = [
    "Based on current market conditions, AAPL is showing strong momentum. "
    "The tech sector has been performing well this quarter.",
    "I'd recommend diversifying your portfolio across sectors. "
    "Your current allocation is heavily weighted toward technology.",
    "Looking at your portfolio, you have a solid cash position. "
    "Consider dollar-cost averaging into your watchlist stocks.",
    "The market is showing mixed signals today. "
    "Keep an eye on the Fed's upcoming policy announcement.",
    "Your unrealized P&L looks healthy. "
    "Consider setting stop-loss orders to protect your gains.",
]

_mock_counter = 0


# ── Pydantic models ──────────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str


class ChatMessageOut(BaseModel):
    role: str
    content: str


class ChatResponse(BaseModel):
    message: ChatMessageOut
    history: list[ChatMessageOut]


# ── Helpers ──────────────────────────────────────────────────────────


async def _get_user_id(conn) -> UUID:
    uid = await conn.fetchval(
        "SELECT id FROM users WHERE email = $1", DEFAULT_USER_EMAIL
    )
    if uid is None:
        raise HTTPException(status_code=500, detail="Default user not found")
    return uid


async def _save_message(conn, user_id: UUID, role: str, content: str) -> None:
    await conn.execute(
        "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3)",
        user_id,
        role,
        content,
    )


async def _get_history(conn, user_id: UUID, limit: int = 50) -> list[ChatMessageOut]:
    rows = await conn.fetch(
        """
        SELECT role, content FROM chat_messages
        WHERE user_id = $1
        ORDER BY created_at ASC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    return [ChatMessageOut(role=row["role"], content=row["content"]) for row in rows]


async def _get_mock_response(message: str) -> str:
    """Return a rotating mock response."""
    global _mock_counter
    response = MOCK_RESPONSES[_mock_counter % len(MOCK_RESPONSES)]
    _mock_counter += 1
    return response


async def _get_llm_response(history: list[ChatMessageOut], message: str) -> str:
    """Call litellm for a real LLM response."""
    try:
        import litellm

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in history[-20:]:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": message})

        response = await litellm.acompletion(
            model="openrouter/google/gemini-2.0-flash-001",
            messages=messages,
            api_key=settings.openrouter_api_key,
            max_tokens=1024,
        )
        return response.choices[0].message.content
    except Exception:
        logger.exception("LLM call failed, falling back to mock")
        return await _get_mock_response(message)


# ── Endpoints ────────────────────────────────────────────────────────


@router.post("", response_model=ChatResponse, status_code=200)
async def send_message(body: ChatRequest) -> ChatResponse:
    """Send a message and receive an assistant response."""
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_user_id(conn)

        # Save user message
        await _save_message(conn, user_id, "user", body.message.strip())

        # Get conversation history for context
        history = await _get_history(conn, user_id)

        # Generate assistant response
        if settings.llm_mock:
            assistant_content = await _get_mock_response(body.message)
        else:
            assistant_content = await _get_llm_response(history, body.message)

        # Save assistant response
        await _save_message(conn, user_id, "assistant", assistant_content)

        # Refresh history to include new messages
        history = await _get_history(conn, user_id)

    assistant_msg = ChatMessageOut(role="assistant", content=assistant_content)
    return ChatResponse(message=assistant_msg, history=history)


@router.get("/history", response_model=list[ChatMessageOut])
async def get_chat_history() -> list[ChatMessageOut]:
    """Return the conversation history."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_user_id(conn)
        return await _get_history(conn, user_id)
