"use client";

import { usePrices } from "@/lib/price-context";

const TICKERS = [
  "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA",
  "NVDA", "META", "JPM", "V", "NFLX",
];

function changePct(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function heatColor(pct: number): string {
  if (pct > 0.5) return "bg-green-600/80";
  if (pct > 0.1) return "bg-green-800/60";
  if (pct < -0.5) return "bg-red-600/80";
  if (pct < -0.1) return "bg-red-800/60";
  return "bg-white/5";
}

export function HeatmapPanel() {
  const { prices } = usePrices();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Market Heatmap
        </h2>
      </div>
      <div className="flex-1 p-2">
        <div className="grid grid-cols-5 gap-1 h-full">
          {TICKERS.map((ticker) => {
            const data = prices.get(ticker);
            const pct = data
              ? changePct(data.price, data.previousPrice)
              : 0;

            return (
              <div
                key={ticker}
                className={`flex flex-col items-center justify-center rounded p-1 transition-colors ${heatColor(pct)}`}
              >
                <span className="text-[10px] font-mono font-bold text-text-primary">
                  {ticker}
                </span>
                {data && (
                  <span
                    className={`text-[9px] font-mono tabular-nums ${
                      pct >= 0 ? "text-green-300" : "text-red-300"
                    }`}
                  >
                    {pct >= 0 ? "+" : ""}
                    {pct.toFixed(2)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
