"use client";

import { usePrices } from "@/lib/price-context";

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const TICKERS = [
  "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA",
  "NVDA", "META", "JPM", "V", "NFLX",
];

export function WatchlistPanel() {
  const { prices } = usePrices();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Watchlist
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-secondary">
              <th className="sticky top-0 bg-bg-secondary px-3 py-1.5 text-left font-medium">
                Symbol
              </th>
              <th className="sticky top-0 bg-bg-secondary px-3 py-1.5 text-right font-medium">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {TICKERS.map((ticker) => {
              const data = prices.get(ticker);
              const dirColor =
                data?.changeDirection === "up"
                  ? "text-green-400"
                  : data?.changeDirection === "down"
                    ? "text-red-400"
                    : "text-text-primary";

              return (
                <tr
                  key={ticker}
                  className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-3 py-1.5 font-mono font-medium text-text-primary">
                    {ticker}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${dirColor}`}
                  >
                    {data ? formatPrice(data.price) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
