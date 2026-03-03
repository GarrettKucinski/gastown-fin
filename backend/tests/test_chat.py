"""Tests for the LLM chat module: parsing, mock responses, trade validation."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.chat import (
    FALLBACK_RESPONSE,
    _mock_llm_response,
    _parse_llm_json,
)


class TestParseLlmJson:
    def test_valid_json(self):
        raw = json.dumps({
            "message": "Hello!",
            "trades": [{"symbol": "AAPL", "side": "buy", "quantity": 10}],
            "watchlist_changes": [],
        })
        result = _parse_llm_json(raw)
        assert result["message"] == "Hello!"
        assert len(result["trades"]) == 1
        assert result["trades"][0]["symbol"] == "AAPL"

    def test_strips_code_fences(self):
        raw = "```json\n" + json.dumps({
            "message": "Hello!",
            "trades": [],
            "watchlist_changes": [],
        }) + "\n```"
        result = _parse_llm_json(raw)
        assert result["message"] == "Hello!"

    def test_defaults_empty_trades(self):
        raw = json.dumps({"message": "Just chatting"})
        result = _parse_llm_json(raw)
        assert result["trades"] == []
        assert result["watchlist_changes"] == []

    def test_missing_message_raises(self):
        raw = json.dumps({"trades": [], "watchlist_changes": []})
        with pytest.raises(ValueError, match="Missing 'message'"):
            _parse_llm_json(raw)

    def test_trades_not_list_raises(self):
        raw = json.dumps({"message": "Hi", "trades": "not a list"})
        with pytest.raises(ValueError, match="'trades' must be a list"):
            _parse_llm_json(raw)

    def test_watchlist_changes_not_list_raises(self):
        raw = json.dumps({"message": "Hi", "watchlist_changes": "bad"})
        with pytest.raises(ValueError, match="'watchlist_changes' must be a list"):
            _parse_llm_json(raw)

    def test_invalid_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            _parse_llm_json("not json at all")

    def test_whitespace_handling(self):
        raw = "  \n  " + json.dumps({"message": "ok"}) + "  \n"
        result = _parse_llm_json(raw)
        assert result["message"] == "ok"

    def test_complex_code_fence(self):
        """Model sometimes wraps in ```json ... ``` with extra lines."""
        inner = json.dumps({
            "message": "Bought AAPL",
            "trades": [{"symbol": "AAPL", "side": "buy", "quantity": 5}],
            "watchlist_changes": [{"symbol": "TSLA", "action": "add"}],
        })
        raw = f"```json\n{inner}\n```\n"
        result = _parse_llm_json(raw)
        assert len(result["trades"]) == 1
        assert len(result["watchlist_changes"]) == 1


class TestMockLlmResponse:
    def test_returns_valid_json(self):
        raw = _mock_llm_response("buy some AAPL")
        parsed = json.loads(raw)
        assert "message" in parsed
        assert parsed["trades"] == []
        assert parsed["watchlist_changes"] == []

    def test_echoes_user_message(self):
        raw = _mock_llm_response("sell everything")
        parsed = json.loads(raw)
        assert "sell everything" in parsed["message"]

    def test_mock_is_parseable(self):
        """Mock output should always pass our own parser."""
        raw = _mock_llm_response("hello")
        result = _parse_llm_json(raw)
        assert result["message"]


class TestFallbackResponse:
    def test_has_required_keys(self):
        assert "message" in FALLBACK_RESPONSE
        assert "trades" in FALLBACK_RESPONSE
        assert "watchlist_changes" in FALLBACK_RESPONSE

    def test_no_actions(self):
        assert FALLBACK_RESPONSE["trades"] == []
        assert FALLBACK_RESPONSE["watchlist_changes"] == []


class TestTradeValidationInParsedResponse:
    """Validate that trade dicts from LLM parsing have correct shape."""

    def test_valid_buy_trade(self):
        raw = json.dumps({
            "message": "Buying AAPL",
            "trades": [{"symbol": "AAPL", "side": "buy", "quantity": 10}],
            "watchlist_changes": [],
        })
        result = _parse_llm_json(raw)
        trade = result["trades"][0]
        assert trade["side"] in ("buy", "sell")
        assert isinstance(trade["quantity"], (int, float))
        assert trade["quantity"] > 0

    def test_valid_sell_trade(self):
        raw = json.dumps({
            "message": "Selling TSLA",
            "trades": [{"symbol": "TSLA", "side": "sell", "quantity": 5}],
            "watchlist_changes": [],
        })
        result = _parse_llm_json(raw)
        trade = result["trades"][0]
        assert trade["side"] == "sell"

    def test_multiple_trades(self):
        raw = json.dumps({
            "message": "Rebalancing",
            "trades": [
                {"symbol": "AAPL", "side": "sell", "quantity": 10},
                {"symbol": "MSFT", "side": "buy", "quantity": 5},
            ],
            "watchlist_changes": [],
        })
        result = _parse_llm_json(raw)
        assert len(result["trades"]) == 2

    def test_watchlist_add_and_remove(self):
        raw = json.dumps({
            "message": "Updating watchlist",
            "trades": [],
            "watchlist_changes": [
                {"symbol": "NVDA", "action": "add"},
                {"symbol": "META", "action": "remove"},
            ],
        })
        result = _parse_llm_json(raw)
        assert result["watchlist_changes"][0]["action"] == "add"
        assert result["watchlist_changes"][1]["action"] == "remove"
