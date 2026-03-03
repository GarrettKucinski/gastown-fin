"use client";

import { useMemo } from "react";
import {
  hierarchy,
  treemap,
  treemapSquarify,
  type HierarchyRectangularNode,
} from "d3-hierarchy";

import { usePriceStream, type PriceMap } from "@/hooks/use-price-stream";
import { usePortfolio, type Position } from "@/hooks/use-portfolio";

// ── Color helpers ──────────────────────────────────────────────────

/** Map P&L % to a color on a red–neutral–green gradient. */
function pnlColor(pnlPct: number): string {
  // Clamp to ±20% for color mapping
  const clamped = Math.max(-20, Math.min(20, pnlPct));
  const t = (clamped + 20) / 40; // 0 (deep red) → 1 (deep green)

  if (t < 0.5) {
    // Red to neutral: interpolate from deep red to dark gray
    const s = t / 0.5;
    const r = Math.round(180 - s * 100);
    const g = Math.round(30 + s * 30);
    const b = Math.round(30 + s * 30);
    return `rgb(${r},${g},${b})`;
  } else {
    // Neutral to green: interpolate from dark gray to deep green
    const s = (t - 0.5) / 0.5;
    const r = Math.round(80 - s * 60);
    const g = Math.round(60 + s * 120);
    const b = Math.round(60 - s * 20);
    return `rgb(${r},${g},${b})`;
  }
}

// Light text on all cells — our P&L palette stays dark enough for contrast
const CELL_TEXT_COLOR = "#e6edf3";

// ── Treemap layout ─────────────────────────────────────────────────

interface TreemapLeaf {
  symbol: string;
  weight: number;
  pnlPct: number;
  currentPrice: number;
  marketValue: number;
}

interface TreemapRoot {
  children: TreemapLeaf[];
}

function computeTreemap(
  positions: Position[],
  prices: PriceMap,
  width: number,
  height: number,
): HierarchyRectangularNode<TreemapRoot | TreemapLeaf>[] {
  // Enrich positions with live prices
  const leaves: TreemapLeaf[] = positions.map((pos) => {
    const live = prices.get(pos.symbol);
    const currentPrice = live?.price ?? pos.current_price;
    const marketValue = pos.quantity * currentPrice;
    const pnlPct =
      pos.avg_cost > 0
        ? ((currentPrice - pos.avg_cost) / pos.avg_cost) * 100
        : 0;

    return {
      symbol: pos.symbol,
      weight: Math.max(marketValue, 1), // treemap needs positive values
      pnlPct,
      currentPrice,
      marketValue,
    };
  });

  const root = hierarchy<TreemapRoot | TreemapLeaf>(
    { children: leaves } as TreemapRoot,
    (d) => ("children" in d ? (d as TreemapRoot).children : undefined),
  ).sum((d) => ("weight" in d && !("children" in d) ? (d as TreemapLeaf).weight : 0));

  const layout = treemap<TreemapRoot | TreemapLeaf>()
    .size([width, height])
    .padding(2)
    .tile(treemapSquarify);

  // layout() mutates nodes in-place, adding x0/y0/x1/y1
  const laid = layout(root);

  return laid.leaves() as HierarchyRectangularNode<TreemapRoot | TreemapLeaf>[];
}

// ── Component ──────────────────────────────────────────────────────

const TREEMAP_WIDTH = 800;
const TREEMAP_HEIGHT = 500;

export default function PortfolioHeatmap() {
  const { portfolio, error } = usePortfolio();
  const prices = usePriceStream();

  const cells = useMemo(() => {
    if (!portfolio?.positions.length) return [];
    return computeTreemap(
      portfolio.positions,
      prices,
      TREEMAP_WIDTH,
      TREEMAP_HEIGHT,
    );
  }, [portfolio, prices]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 text-sm">
        Failed to load portfolio: {error}
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary text-sm">
        Loading portfolio…
      </div>
    );
  }

  if (!portfolio.positions.length) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary text-sm">
        No positions in portfolio
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Portfolio Heatmap
        </h2>
        <span className="text-xs text-text-secondary tabular-nums">
          ${portfolio.total_value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div
        className="relative rounded-lg overflow-hidden border border-border"
        style={{ width: TREEMAP_WIDTH, height: TREEMAP_HEIGHT, maxWidth: "100%" }}
      >
        {/* SVG-based treemap for crisp rendering */}
        <svg
          viewBox={`0 0 ${TREEMAP_WIDTH} ${TREEMAP_HEIGHT}`}
          className="w-full h-auto"
          style={{ display: "block" }}
        >
          {cells.map((node) => {
            const d = node.data as TreemapLeaf;
            const w = (node.x1 ?? 0) - (node.x0 ?? 0);
            const h = (node.y1 ?? 0) - (node.y0 ?? 0);
            const bg = pnlColor(d.pnlPct);
            const fg = CELL_TEXT_COLOR;

            // Only show labels if cell is large enough
            const showTicker = w > 40 && h > 28;
            const showPnl = w > 40 && h > 44;
            const showPrice = w > 60 && h > 60;

            // Font sizing based on cell area
            const area = w * h;
            const tickerSize = Math.max(10, Math.min(18, Math.sqrt(area) / 6));
            const pnlSize = Math.max(9, Math.min(14, tickerSize * 0.75));
            const priceSize = Math.max(8, Math.min(11, tickerSize * 0.6));

            return (
              <g key={d.symbol}>
                <rect
                  x={node.x0}
                  y={node.y0}
                  width={w}
                  height={h}
                  fill={bg}
                  rx={3}
                  className="transition-[fill] duration-300"
                />
                {showTicker && (
                  <text
                    x={(node.x0 ?? 0) + w / 2}
                    y={(node.y0 ?? 0) + h / 2 - (showPnl ? pnlSize * 0.6 : 0) - (showPrice ? priceSize * 0.4 : 0)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={fg}
                    fontSize={tickerSize}
                    fontWeight="700"
                    fontFamily="ui-monospace, monospace"
                  >
                    {d.symbol}
                  </text>
                )}
                {showPnl && (
                  <text
                    x={(node.x0 ?? 0) + w / 2}
                    y={(node.y0 ?? 0) + h / 2 + tickerSize * 0.4 - (showPrice ? priceSize * 0.3 : 0)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={fg}
                    fontSize={pnlSize}
                    fontWeight="600"
                    fontFamily="ui-monospace, monospace"
                    opacity={0.9}
                  >
                    {d.pnlPct >= 0 ? "+" : ""}
                    {d.pnlPct.toFixed(1)}%
                  </text>
                )}
                {showPrice && (
                  <text
                    x={(node.x0 ?? 0) + w / 2}
                    y={(node.y0 ?? 0) + h / 2 + tickerSize * 0.4 + pnlSize * 0.8}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={fg}
                    fontSize={priceSize}
                    fontFamily="ui-monospace, monospace"
                    opacity={0.6}
                  >
                    ${d.currentPrice.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
