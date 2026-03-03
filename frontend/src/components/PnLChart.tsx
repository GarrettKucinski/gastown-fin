"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistoryPoint {
  timestamp: string;
  value: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(timestamp: unknown): string {
  return new Date(String(timestamp)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PnLChart() {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      try {
        const res = await fetch("/api/portfolio/history");
        const data = await res.json();
        if (!cancelled) {
          setHistory(data.history);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchHistory();
    // Refresh every 60 seconds
    const interval = setInterval(fetchHistory, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Portfolio Value</h2>
        <div className="h-[300px] flex items-center justify-center text-text-secondary">
          Loading chart...
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Portfolio Value</h2>
        <div className="h-[300px] flex items-center justify-center text-text-secondary">
          No portfolio history available
        </div>
      </div>
    );
  }

  const startValue = history[0].value;
  const endValue = history[history.length - 1].value;
  const totalChange = endValue - startValue;
  const totalChangePercent = (totalChange / startValue) * 100;
  const isPositive = totalChange >= 0;

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Portfolio Value</h2>
          <span className="text-2xl font-bold">{formatCurrency(endValue)}</span>
        </div>
        <div className="text-right">
          <span
            className={`text-sm font-medium ${isPositive ? "text-green-400" : "text-red-400"}`}
          >
            {isPositive ? "+" : ""}
            {formatCurrency(totalChange)} ({isPositive ? "+" : ""}
            {totalChangePercent.toFixed(2)}%)
          </span>
          <p className="text-xs text-text-secondary">90 days</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={history}>
          <defs>
            <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={isPositive ? "#22c55e" : "#ef4444"}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={isPositive ? "#22c55e" : "#ef4444"}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatDate}
            stroke="#8b949e"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tickFormatter={(v) => formatCurrency(v)}
            stroke="#8b949e"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={80}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a2e",
              border: "1px solid #30363d",
              borderRadius: "8px",
              color: "#e6edf3",
              fontSize: "13px",
            }}
            labelFormatter={formatDate}
            formatter={(value) => [formatCurrency(Number(value)), "Value"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={isPositive ? "#22c55e" : "#ef4444"}
            strokeWidth={2}
            fill="url(#valueGradient)"
            dot={false}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
