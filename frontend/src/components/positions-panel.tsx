"use client";

import { usePortfolio } from "@/lib/portfolio-context";

function fmt(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pnlColor(pnl: number | null): string {
  if (pnl === null) return "text-text-secondary";
  if (pnl > 0) return "text-green-400";
  if (pnl < 0) return "text-red-400";
  return "text-text-primary";
}

export function PositionsPanel() {
  const { positions, loading } = usePortfolio();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Positions
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-text-secondary">
            Loading...
          </div>
        ) : positions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-text-secondary">
            No open positions
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-secondary">
                <th className="sticky top-0 bg-bg-secondary px-3 py-1.5 text-left font-medium">
                  Symbol
                </th>
                <th className="sticky top-0 bg-bg-secondary px-3 py-1.5 text-right font-medium">
                  Qty
                </th>
                <th className="sticky top-0 bg-bg-secondary px-3 py-1.5 text-right font-medium">
                  Avg Cost
                </th>
                <th className="sticky top-0 bg-bg-secondary px-3 py-1.5 text-right font-medium">
                  Mkt Val
                </th>
                <th className="sticky top-0 bg-bg-secondary px-3 py-1.5 text-right font-medium">
                  P&L
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr
                  key={pos.symbol}
                  className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-3 py-1.5 font-mono font-medium text-text-primary">
                    {pos.symbol}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {fmt(pos.quantity, 0)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text-secondary">
                    ${fmt(pos.avg_cost)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    ${fmt(pos.market_value)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${pnlColor(pos.unrealized_pnl)}`}
                  >
                    {pos.unrealized_pnl !== null && pos.unrealized_pnl >= 0
                      ? "+"
                      : ""}
                    ${fmt(pos.unrealized_pnl)}
                    {pos.unrealized_pnl_pct !== null && (
                      <span className="ml-1 text-text-secondary">
                        ({pos.unrealized_pnl_pct >= 0 ? "+" : ""}
                        {fmt(pos.unrealized_pnl_pct)}%)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
