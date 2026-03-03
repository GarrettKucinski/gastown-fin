"use client";

import { useState } from "react";
import { usePortfolio } from "@/lib/portfolio-context";

export function TradeBar() {
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const { refetch } = usePortfolio();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim() || !quantity.trim()) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/portfolio/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.toUpperCase(),
          side,
          quantity: parseFloat(quantity),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || `Trade failed: ${res.status}`);
      }

      const data = await res.json();
      setMessage({
        text: `${data.side.toUpperCase()} ${data.quantity} ${data.symbol} @ $${data.price.toFixed(2)}`,
        type: "success",
      });
      setTicker("");
      setQuantity("");
      refetch();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Trade failed",
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-border bg-bg-secondary px-3 py-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex rounded border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              side === "buy"
                ? "bg-green-600 text-white"
                : "bg-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              side === "sell"
                ? "bg-red-600 text-white"
                : "bg-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            SELL
          </button>
        </div>

        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="TICKER"
          className="w-20 rounded border border-border bg-bg-primary px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-secondary/50 focus:border-accent-blue focus:outline-none"
          maxLength={5}
        />

        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="QTY"
          className="w-20 rounded border border-border bg-bg-primary px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-secondary/50 focus:border-accent-blue focus:outline-none"
          min="1"
          step="1"
        />

        <button
          type="submit"
          disabled={submitting || !ticker.trim() || !quantity.trim()}
          className="rounded bg-accent-blue px-4 py-1 text-xs font-semibold text-white transition-colors hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "..." : "Execute"}
        </button>

        {message && (
          <span
            className={`text-xs font-mono ${
              message.type === "success" ? "text-green-400" : "text-red-400"
            }`}
          >
            {message.text}
          </span>
        )}
      </form>
    </div>
  );
}
