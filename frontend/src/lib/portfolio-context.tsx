"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { usePrices } from "./price-context";

export interface Position {
  symbol: string;
  quantity: number;
  avg_cost: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
}

interface PortfolioSnapshot {
  cash_balance: number;
  positions: Position[];
}

export interface PortfolioContextValue {
  cashBalance: number;
  totalValue: number;
  positions: Position[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const PortfolioContext = createContext<PortfolioContextValue>({
  cashBalance: 0,
  totalValue: 0,
  positions: [],
  loading: true,
  error: null,
  refetch: () => {},
});

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { prices } = usePrices();

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio");
      if (!res.ok) throw new Error(`Portfolio fetch failed: ${res.status}`);
      const data = await res.json();
      setSnapshot({
        cash_balance: data.cash_balance,
        positions: data.positions,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 30_000);
    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  // Re-derive totals from live prices
  const positions: Position[] = (snapshot?.positions ?? []).map((pos) => {
    const livePrice = prices.get(pos.symbol);
    if (livePrice) {
      const currentPrice = livePrice.price;
      const marketValue = pos.quantity * currentPrice;
      const costBasis = pos.quantity * pos.avg_cost;
      const pnl = marketValue - costBasis;
      const pnlPct = costBasis !== 0 ? (pnl / costBasis) * 100 : 0;
      return {
        ...pos,
        current_price: currentPrice,
        market_value: marketValue,
        unrealized_pnl: pnl,
        unrealized_pnl_pct: pnlPct,
      };
    }
    return pos;
  });

  const positionsValue = positions.reduce(
    (sum, p) => sum + (p.market_value ?? 0),
    0,
  );
  const cashBalance = snapshot?.cash_balance ?? 0;
  const totalValue = cashBalance + positionsValue;

  return (
    <PortfolioContext.Provider
      value={{
        cashBalance,
        totalValue,
        positions,
        loading,
        error,
        refetch: fetchPortfolio,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  return useContext(PortfolioContext);
}
