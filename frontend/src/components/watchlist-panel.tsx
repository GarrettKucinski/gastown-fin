"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrices } from "@/lib";
import type { TickerPrice } from "@/lib/types";
import { WatchlistRow } from "./watchlist-row";
import { AddTickerForm } from "./add-ticker-form";

interface WatchlistItem {
  symbol: string;
  price: number | null;
  previous_price: number | null;
  change_direction: string | null;
}

interface WatchlistPanelProps {
  /** Callback when a ticker is clicked to select it for the main chart. */
  onSelectTicker?: (ticker: string) => void;
  /** The currently selected ticker. */
  selectedTicker?: string | null;
}

/**
 * Watchlist panel: grid of tracked tickers with real-time prices,
 * flash animations, sparkline charts, and add/remove controls.
 *
 * Fetches the watchlist from the backend API and subscribes to
 * SSE price updates via the PriceProvider context.
 */
export function WatchlistPanel({
  onSelectTicker,
  selectedTicker,
}: WatchlistPanelProps) {
  const { prices, status } = usePrices();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch watchlist from backend on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchWatchlist() {
      try {
        const res = await fetch("/api/watchlist");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setWatchlist(
            (data.items as WatchlistItem[]).map((item) => item.symbol),
          );
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load watchlist",
          );
          setLoading(false);
        }
      }
    }

    fetchWatchlist();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = useCallback(async (ticker: string) => {
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (res.status === 409) {
        // Already exists — no-op
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWatchlist((prev) => [...prev, ticker]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add ticker",
      );
    }
  }, []);

  const handleRemove = useCallback(async (ticker: string) => {
    try {
      const res = await fetch(`/api/watchlist/${ticker}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      setWatchlist((prev) => prev.filter((t) => t !== ticker));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove ticker",
      );
    }
  }, []);

  const handleSelect = useCallback(
    (ticker: string) => {
      onSelectTicker?.(ticker);
    },
    [onSelectTicker],
  );

  // Build a TickerPrice for each watchlist item, merging SSE data
  const rows: { ticker: string; data: TickerPrice }[] = watchlist.map(
    (symbol) => {
      const sseData = prices.get(symbol);
      const data: TickerPrice = sseData ?? {
        ticker: symbol,
        price: 0,
        previousPrice: 0,
        changeDirection: "flat",
        timestamp: 0,
        history: [],
      };
      return { ticker: symbol, data };
    },
  );

  return (
    <div className="flex flex-col h-full bg-bg-primary border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary/50">
        <h2 className="text-sm font-semibold text-text-primary">Watchlist</h2>
        <div className="flex items-center gap-2">
          {status === "connected" && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
          {status === "reconnecting" && (
            <span className="flex items-center gap-1.5 text-xs text-accent-yellow">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />
              Reconnecting
            </span>
          )}
          {status === "disconnected" && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-text-secondary" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[72px_1fr_80px_120px_32px] gap-3 px-4 py-2 text-xs text-text-secondary border-b border-border/30">
        <span>Symbol</span>
        <span>Price</span>
        <span>Change</span>
        <span>Trend</span>
        <span />
      </div>

      {/* Ticker rows */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-text-secondary">
            Loading watchlist...
          </div>
        )}

        {error && (
          <div className="px-4 py-3 text-sm text-red-400">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 underline text-text-secondary hover:text-text-primary"
            >
              Dismiss
            </button>
          </div>
        )}

        {!loading && watchlist.length === 0 && (
          <div className="flex items-center justify-center py-8 text-sm text-text-secondary">
            No tickers in watchlist. Add one below.
          </div>
        )}

        {rows.map(({ ticker, data }) => (
          <WatchlistRow
            key={ticker}
            tickerPrice={data}
            isSelected={selectedTicker === ticker}
            onSelect={handleSelect}
            onRemove={handleRemove}
          />
        ))}
      </div>

      {/* Add ticker form */}
      <div className="border-t border-border">
        <AddTickerForm onAdd={handleAdd} disabled={loading} />
      </div>
    </div>
  );
}
