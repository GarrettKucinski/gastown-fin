"use client";

import { WatchlistPanel } from "@/components/watchlist-panel";
import { PriceChartPanel } from "@/components/price-chart-panel";
import { HeatmapPanel } from "@/components/heatmap-panel";
import { PositionsPanel } from "@/components/positions-panel";
import { PnlChartPanel } from "@/components/pnl-chart-panel";
import { TradeBar } from "@/components/trade-bar";
import { ChatPanel } from "@/components/chat-panel";

/**
 * Full trading terminal layout — Bloomberg-inspired, data-dense.
 *
 * Grid structure (desktop):
 * ┌─────────┬──────────────────────────┬─────────┐
 * │         │       Price Chart        │         │
 * │ Watch-  ├──────────────────────────┤  Chat   │
 * │  list   │  Heatmap  │  P&L Chart  │  Panel  │
 * │         ├──────────────────────────┤         │
 * │         │    Positions Table       │         │
 * │         ├──────────────────────────┤         │
 * │         │       Trade Bar          │         │
 * └─────────┴──────────────────────────┴─────────┘
 */
export default function Home() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar: Watchlist */}
      <aside className="hidden w-48 shrink-0 border-r border-border bg-bg-secondary md:block">
        <WatchlistPanel />
      </aside>

      {/* Center: main trading area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top: Price chart */}
        <div className="h-[40%] min-h-[180px] border-b border-border">
          <PriceChartPanel />
        </div>

        {/* Middle row: Heatmap + P&L */}
        <div className="flex h-[25%] min-h-[120px] border-b border-border">
          <div className="flex-1 border-r border-border">
            <HeatmapPanel />
          </div>
          <div className="flex-1">
            <PnlChartPanel />
          </div>
        </div>

        {/* Positions table */}
        <div className="flex-1 overflow-hidden">
          <PositionsPanel />
        </div>

        {/* Trade bar at bottom */}
        <TradeBar />
      </div>

      {/* Right sidebar: AI Chat */}
      <aside className="hidden w-64 shrink-0 border-l border-border bg-bg-secondary lg:block">
        <ChatPanel />
      </aside>
    </div>
  );
}
