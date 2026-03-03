"use client";

import { useEffect, useRef, useState } from "react";
import type { TickerPrice } from "@/lib/types";
import { Sparkline } from "./sparkline";

interface WatchlistRowProps {
  tickerPrice: TickerPrice;
  isSelected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

/**
 * Single row in the watchlist grid.
 *
 * Displays ticker symbol, current price with flash animation on change,
 * change percentage vs seed price, and a mini sparkline chart.
 */
export function WatchlistRow({
  tickerPrice,
  isSelected,
  onSelect,
  onRemove,
}: WatchlistRowProps) {
  const { ticker, price, previousPrice, changeDirection, history } =
    tickerPrice;

  // Flash state: "up" | "down" | null
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPriceRef = useRef(price);

  useEffect(() => {
    if (price !== prevPriceRef.current) {
      const direction = price > prevPriceRef.current ? "up" : "down";
      setFlash(direction);
      prevPriceRef.current = price;

      const timer = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(timer);
    }
  }, [price]);

  // Change % calculated from the first price in history (seed) to current
  const seedPrice = history.length > 0 ? history[0].price : previousPrice;
  const changePct =
    seedPrice > 0 ? ((price - seedPrice) / seedPrice) * 100 : 0;
  const isPositive = changePct >= 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(ticker)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(ticker);
        }
      }}
      className={`
        group relative grid grid-cols-[72px_1fr_80px_120px_32px] items-center gap-3
        px-4 py-3 w-full text-left transition-colors duration-150 cursor-pointer
        border-b border-border/50 hover:bg-bg-secondary/60
        focus:outline-none focus:ring-1 focus:ring-accent-blue/50
        ${isSelected ? "bg-bg-secondary border-l-2 border-l-accent-blue" : ""}
      `}
    >
      {/* Flash overlay */}
      <div
        className={`
          absolute inset-0 pointer-events-none transition-opacity duration-500
          ${flash === "up" ? "opacity-100 bg-green-500/10" : ""}
          ${flash === "down" ? "opacity-100 bg-red-500/10" : ""}
          ${flash === null ? "opacity-0" : ""}
        `}
      />

      {/* Ticker symbol */}
      <span className="font-mono font-semibold text-sm text-text-primary z-10">
        {ticker}
      </span>

      {/* Current price */}
      <span
        className={`
          font-mono text-sm tabular-nums z-10
          ${changeDirection === "up" ? "text-green-400" : ""}
          ${changeDirection === "down" ? "text-red-400" : ""}
          ${changeDirection === "flat" ? "text-text-secondary" : ""}
        `}
      >
        ${price.toFixed(2)}
      </span>

      {/* Change % */}
      <span
        className={`
          font-mono text-xs tabular-nums z-10
          ${isPositive ? "text-green-400" : "text-red-400"}
        `}
      >
        {isPositive ? "+" : ""}
        {changePct.toFixed(2)}%
      </span>

      {/* Sparkline */}
      <div className="z-10">
        <Sparkline data={history} width={120} height={32} />
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(ticker);
        }}
        className="
          z-10 opacity-0 group-hover:opacity-100 transition-opacity
          text-text-secondary hover:text-red-400 text-lg leading-none
        "
        aria-label={`Remove ${ticker}`}
      >
        &times;
      </button>
    </div>
  );
}
