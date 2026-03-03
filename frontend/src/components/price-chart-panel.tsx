"use client";

import { usePrices } from "@/lib/price-context";

/** Renders a simple ASCII-style sparkline from price history. */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const width = 600;
  const height = 120;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const lastVal = data[data.length - 1];
  const firstVal = data[0];
  const color = lastVal >= firstVal ? "#22c55e" : "#ef4444";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function PriceChartPanel() {
  const { prices } = usePrices();

  // Default to showing the first ticker with history
  const defaultTicker = "AAPL";
  const tickerData = prices.get(defaultTicker);
  const history = tickerData?.history.map((p) => p.price) ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Price Chart
        </h2>
        <span className="font-mono text-sm font-semibold text-text-primary">
          {defaultTicker}
          {tickerData && (
            <span
              className={`ml-2 ${
                tickerData.changeDirection === "up"
                  ? "text-green-400"
                  : tickerData.changeDirection === "down"
                    ? "text-red-400"
                    : "text-text-secondary"
              }`}
            >
              {tickerData.price.toFixed(2)}
            </span>
          )}
        </span>
      </div>
      <div className="flex-1 p-3">
        {history.length >= 2 ? (
          <Sparkline data={history} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-secondary">
            Waiting for price data...
          </div>
        )}
      </div>
    </div>
  );
}
