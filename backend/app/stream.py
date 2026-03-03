"""SSE streaming endpoint for real-time price updates.

Pushes price cache snapshots to connected clients at ~500ms cadence.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.price_cache import price_cache

router = APIRouter()


async def _price_event_generator() -> AsyncIterator[str]:
    """Yield SSE-formatted price events whenever the cache updates."""
    try:
        while True:
            await price_cache.wait_for_update()

            entries = price_cache.snapshot()
            for entry in entries:
                event_data = json.dumps(
                    {
                        "ticker": entry.ticker,
                        "price": entry.price,
                        "previous_price": entry.previous_price,
                        "timestamp": entry.timestamp,
                        "change_direction": entry.change_direction,
                    }
                )
                yield f"data: {event_data}\n\n"
    except asyncio.CancelledError:
        return


@router.get("/api/stream/prices")
async def stream_prices() -> StreamingResponse:
    """SSE endpoint that streams real-time price updates for all tickers."""
    return StreamingResponse(
        _price_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
