"use client";

import { useEffect, useState } from "react";

interface Snapshot {
  total_value: number;
  cash_balance: number;
  snapshot_at: string;
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const width = 400;
  const height = 80;
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

export function PnlChartPanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    fetch("/api/portfolio/history")
      .then((r) => r.json())
      .then((data) => setSnapshots(data.snapshots ?? []))
      .catch(() => {});
  }, []);

  const values = snapshots.map((s) => s.total_value);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          P&L History
        </h2>
      </div>
      <div className="flex-1 p-3">
        {values.length >= 2 ? (
          <Sparkline data={values} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-secondary">
            No history yet — execute trades to generate P&L data
          </div>
        )}
      </div>
    </div>
  );
}
