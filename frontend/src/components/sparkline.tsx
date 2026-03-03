"use client";

import type { PricePoint } from "@/lib/types";

interface SparklineProps {
  data: PricePoint[];
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Tiny SVG sparkline chart drawn from accumulated price history.
 *
 * Fills in progressively as SSE data arrives. Uses a polyline
 * that scales to fit the viewBox regardless of data range.
 */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  className = "",
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        aria-label="Sparkline (waiting for data)"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-text-secondary)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.4}
        />
      </svg>
    );
  }

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const padding = 2;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;

  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((d.price - min) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  // Color based on overall direction (first vs last price)
  const trending = data[data.length - 1].price >= data[0].price;
  const strokeColor = trending
    ? "var(--color-spark-up, #22c55e)"
    : "var(--color-spark-down, #ef4444)";

  return (
    <svg
      width={width}
      height={height}
      className={className}
      aria-label="Price sparkline"
    >
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
