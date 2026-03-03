"use client";

import { useEffect, useMemo, useState } from "react";
import type { PriceMap } from "@/hooks/usePriceStream";

interface Position {
  symbol: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  pnl_percent: number;
  change_direction: string;
}

interface PositionsSummary {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_percent: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function PnLCell({ value, percent }: { value: number; percent: number }) {
  const isPositive = value >= 0;
  return (
    <div className={isPositive ? "text-green-400" : "text-red-400"}>
      <span className="font-medium">
        {isPositive ? "+" : ""}
        {formatCurrency(value)}
      </span>
      <span className="text-xs ml-1 opacity-75">
        ({isPositive ? "+" : ""}
        {percent.toFixed(2)}%)
      </span>
    </div>
  );
}

function PriceCell({
  price,
  direction,
}: {
  price: number;
  direction: string;
}) {
  const colorClass =
    direction === "up"
      ? "text-green-400"
      : direction === "down"
        ? "text-red-400"
        : "text-text-primary";

  return (
    <span className={`font-mono transition-colors duration-300 ${colorClass}`}>
      {formatCurrency(price)}
    </span>
  );
}

export function PositionsTable({ prices }: { prices: PriceMap }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PositionsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPositions() {
      try {
        const res = await fetch("/api/portfolio/positions");
        const data = await res.json();
        if (!cancelled) {
          setPositions(data.positions);
          setSummary(data.summary);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPositions();
    // Re-fetch positions every 30 seconds for base data
    const interval = setInterval(fetchPositions, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Merge live prices from SSE stream into positions
  const livePositions = useMemo(() => {
    return positions.map((pos) => {
      const livePrice = prices[pos.symbol];
      if (!livePrice) return pos;

      const currentPrice = livePrice.price;
      const marketValue = pos.quantity * currentPrice;
      const costBasis = pos.quantity * pos.avg_cost;
      const unrealizedPnl = marketValue - costBasis;
      const pnlPercent = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

      return {
        ...pos,
        current_price: currentPrice,
        market_value: marketValue,
        unrealized_pnl: unrealizedPnl,
        pnl_percent: pnlPercent,
        change_direction: livePrice.change_direction,
      };
    });
  }, [positions, prices]);

  // Recompute summary from live positions
  const liveSummary = useMemo(() => {
    if (!summary) return null;
    const totalValue = livePositions.reduce((s, p) => s + p.market_value, 0);
    const totalCost = livePositions.reduce(
      (s, p) => s + p.quantity * p.avg_cost,
      0,
    );
    const totalPnl = totalValue - totalCost;
    return {
      total_value: totalValue,
      total_cost: totalCost,
      total_pnl: totalPnl,
      total_pnl_percent: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
    };
  }, [livePositions, summary]);

  if (loading) {
    return (
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Positions</h2>
        <div className="text-text-secondary">Loading positions...</div>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold">Positions</h2>
        {liveSummary && (
          <div className="text-right">
            <span className="text-sm text-text-secondary mr-3">
              Total: {formatCurrency(liveSummary.total_value)}
            </span>
            <PnLCell
              value={liveSummary.total_pnl}
              percent={liveSummary.total_pnl_percent}
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary text-left">
              <th className="py-3 pr-4 font-medium">Ticker</th>
              <th className="py-3 pr-4 font-medium text-right">Qty</th>
              <th className="py-3 pr-4 font-medium text-right">Avg Cost</th>
              <th className="py-3 pr-4 font-medium text-right">Price</th>
              <th className="py-3 pr-4 font-medium text-right">
                Market Value
              </th>
              <th className="py-3 font-medium text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {livePositions.map((pos) => (
              <tr
                key={pos.symbol}
                className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
              >
                <td className="py-3 pr-4">
                  <span className="font-semibold text-accent-yellow">
                    {pos.symbol}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right font-mono">
                  {pos.quantity}
                </td>
                <td className="py-3 pr-4 text-right font-mono text-text-secondary">
                  {formatCurrency(pos.avg_cost)}
                </td>
                <td className="py-3 pr-4 text-right">
                  <PriceCell
                    price={pos.current_price}
                    direction={pos.change_direction}
                  />
                </td>
                <td className="py-3 pr-4 text-right font-mono">
                  {formatCurrency(pos.market_value)}
                </td>
                <td className="py-3 text-right">
                  <PnLCell
                    value={pos.unrealized_pnl}
                    percent={pos.pnl_percent}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
