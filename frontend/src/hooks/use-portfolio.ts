"use client";

import { useCallback, useEffect, useState } from "react";

export interface Position {
  symbol: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  pnl: number;
  pnl_pct: number;
  weight: number;
}

export interface Portfolio {
  positions: Position[];
  total_value: number;
  cash_balance: number;
}

/**
 * Fetch portfolio positions from the API.
 * Re-fetches on demand via `refetch()`.
 */
export function usePortfolio() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Portfolio = await res.json();
      setPortfolio(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch portfolio");
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { portfolio, error, refetch: fetch_ };
}
