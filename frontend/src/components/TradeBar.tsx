"use client";

import { useState } from "react";

type TradeStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

interface TradeBarProps {
  onTradeComplete?: () => void;
}

export default function TradeBar({ onTradeComplete }: TradeBarProps) {
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState<TradeStatus>({ kind: "idle" });

  const canSubmit =
    ticker.trim().length > 0 &&
    quantity.trim().length > 0 &&
    parseFloat(quantity) > 0 &&
    status.kind !== "submitting";

  async function submitTrade(side: "buy" | "sell") {
    if (!canSubmit) return;

    setStatus({ kind: "submitting" });

    try {
      const res = await fetch("/api/portfolio/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: ticker.trim().toUpperCase(),
          side,
          quantity: parseFloat(quantity),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.detail ?? `Trade failed (${res.status})`;
        setStatus({ kind: "error", message: msg });
        return;
      }

      setStatus({
        kind: "success",
        message: `${side === "buy" ? "Bought" : "Sold"} ${quantity} ${ticker.toUpperCase()}`,
      });
      setTicker("");
      setQuantity("");
      onTradeComplete?.();
    } catch {
      setStatus({ kind: "error", message: "Network error — try again" });
    }
  }

  return (
    <div className="border-t border-border bg-bg-secondary px-6 py-4">
      <div className="flex items-end gap-4">
        {/* Ticker field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="trade-ticker"
            className="text-xs font-medium text-text-secondary uppercase tracking-wide"
          >
            Ticker
          </label>
          <input
            id="trade-ticker"
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="AAPL"
            className="w-28 rounded border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-accent-purple focus:outline-none"
          />
        </div>

        {/* Quantity field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="trade-quantity"
            className="text-xs font-medium text-text-secondary uppercase tracking-wide"
          >
            Quantity
          </label>
          <input
            id="trade-quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.00"
            min="0"
            step="any"
            className="w-32 rounded border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-accent-purple focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>

        {/* Buy / Sell buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => submitTrade("buy")}
            className="rounded bg-accent-purple px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status.kind === "submitting" ? "..." : "Buy"}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => submitTrade("sell")}
            className="rounded bg-accent-purple px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status.kind === "submitting" ? "..." : "Sell"}
          </button>
        </div>

        {/* Feedback */}
        {status.kind === "success" && (
          <span className="text-sm text-green-400">{status.message}</span>
        )}
        {status.kind === "error" && (
          <span className="text-sm text-red-400">{status.message}</span>
        )}
      </div>
    </div>
  );
}
