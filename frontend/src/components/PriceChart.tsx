"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import { usePriceContext } from "@/context/PriceContext";

const CHART_COLORS = {
  background: "#0d1117",
  text: "#8b949e",
  textBold: "#e6edf3",
  line: "#209dd7",
  grid: "#1a1a2e",
  crosshair: "#30363d",
  borderColor: "#30363d",
  upColor: "#3fb950",
  downColor: "#f85149",
};

export function PriceChart() {
  const { history, latest, selectedTicker, setSelectedTicker, connected } =
    usePriceContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const prevTickerRef = useRef<string>("");

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
        fontFamily:
          "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        vertLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: CHART_COLORS.crosshair },
        horzLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: CHART_COLORS.crosshair },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.borderColor,
      },
      timeScale: {
        borderColor: CHART_COLORS.borderColor,
        timeVisible: true,
        secondsVisible: true,
      },
      autoSize: true,
    });

    const series = chart.addSeries(LineSeries, {
      color: CHART_COLORS.line,
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update chart data when ticker changes or new data arrives
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const tickerHistory = history.get(selectedTicker);
    if (!tickerHistory || tickerHistory.length === 0) return;

    const data = tickerHistory.map((h) => ({
      time: h.time as UTCTimestamp,
      value: h.value,
    }));

    if (prevTickerRef.current !== selectedTicker) {
      // Ticker changed — load full history
      series.setData(data);
      chart.timeScale().fitContent();
      prevTickerRef.current = selectedTicker;

      // Update line color based on direction
      const tick = latest.get(selectedTicker);
      if (tick) {
        series.applyOptions({
          color:
            tick.change_direction === "up"
              ? CHART_COLORS.upColor
              : tick.change_direction === "down"
                ? CHART_COLORS.downColor
                : CHART_COLORS.line,
        });
      }
    } else {
      // Same ticker — just update the latest point
      const lastPoint = data[data.length - 1];
      series.update(lastPoint);

      // Update color on direction change
      const tick = latest.get(selectedTicker);
      if (tick) {
        series.applyOptions({
          color:
            tick.change_direction === "up"
              ? CHART_COLORS.upColor
              : tick.change_direction === "down"
                ? CHART_COLORS.downColor
                : CHART_COLORS.line,
        });
      }
    }
  }, [history, selectedTicker, latest]);

  // Format price for display
  const currentTick = latest.get(selectedTicker);
  const currentPrice = currentTick?.price;
  const priceChange = currentTick
    ? currentTick.price - currentTick.previous_price
    : 0;
  const priceChangePercent = currentTick?.previous_price
    ? (priceChange / currentTick.previous_price) * 100
    : 0;
  const isUp = priceChange >= 0;

  // Available tickers for the selector
  const tickers = Array.from(latest.keys()).sort();

  const handleTickerClick = useCallback(
    (ticker: string) => {
      setSelectedTicker(ticker);
    },
    [setSelectedTicker],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Chart header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-text-primary font-mono">
            {selectedTicker}
          </h2>
          {currentPrice !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono font-semibold text-text-primary">
                ${currentPrice.toFixed(2)}
              </span>
              <span
                className={`text-sm font-mono ${isUp ? "text-green-400" : "text-red-400"}`}
              >
                {isUp ? "+" : ""}
                {priceChange.toFixed(2)} ({isUp ? "+" : ""}
                {priceChangePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
          />
          <span className="text-xs text-text-secondary font-mono">
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Ticker selector row */}
      {tickers.length > 0 && (
        <div className="flex gap-1 px-4 py-2 border-b border-border overflow-x-auto">
          {tickers.map((ticker) => {
            const tick = latest.get(ticker);
            const isSelected = ticker === selectedTicker;
            const dir = tick?.change_direction;
            return (
              <button
                key={ticker}
                onClick={() => handleTickerClick(ticker)}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                  isSelected
                    ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/40"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary border border-transparent"
                }`}
              >
                {ticker}
                {tick && (
                  <span
                    className={`ml-1.5 ${
                      dir === "up"
                        ? "text-green-400"
                        : dir === "down"
                          ? "text-red-400"
                          : "text-text-secondary"
                    }`}
                  >
                    ${tick.price.toFixed(2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
