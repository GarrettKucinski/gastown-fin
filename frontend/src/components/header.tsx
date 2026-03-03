"use client";

import { usePrices } from "@/lib/price-context";
import { usePortfolio } from "@/lib/portfolio-context";
import type { ConnectionStatus } from "@/lib/types";

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: "bg-green-500",
  reconnecting: "bg-yellow-500 animate-pulse",
  disconnected: "bg-red-500",
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Live",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function Header() {
  const { status } = usePrices();
  const { totalValue, cashBalance, loading } = usePortfolio();

  return (
    <header className="flex items-center justify-between border-b border-border bg-bg-secondary px-4 py-2">
      {/* Left: brand */}
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-tight text-accent-yellow">
          GF
        </span>
        <span className="hidden text-sm font-medium text-text-secondary sm:inline">
          Gastown Finance
        </span>
      </div>

      {/* Center: portfolio stats */}
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-text-secondary">
            Portfolio
          </div>
          <div className="text-sm font-mono font-semibold tabular-nums text-text-primary">
            {loading ? "—" : formatUSD(totalValue)}
          </div>
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-text-secondary">
            Cash
          </div>
          <div className="text-sm font-mono font-semibold tabular-nums text-text-primary">
            {loading ? "—" : formatUSD(cashBalance)}
          </div>
        </div>
      </div>

      {/* Right: connection status */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[status]}`}
          title={STATUS_LABELS[status]}
        />
        <span className="text-xs text-text-secondary">
          {STATUS_LABELS[status]}
        </span>
      </div>
    </header>
  );
}
