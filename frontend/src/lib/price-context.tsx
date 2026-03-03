"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  ConnectionStatus,
  PriceEvent,
  TickerPrice,
} from "./types";
import { PriceSSEClient } from "./sse-client";

const MAX_HISTORY = 500;

interface PriceContextValue {
  /** Map of ticker symbol to current price state. */
  prices: Map<string, TickerPrice>;
  /** Current SSE connection status. */
  status: ConnectionStatus;
}

const PriceContext = createContext<PriceContextValue>({
  prices: new Map(),
  status: "disconnected",
});

/**
 * Provider that manages the SSE connection and price state.
 *
 * Mount once near the app root. All children can read prices
 * and connection status via `usePrices()`.
 */
export function PriceProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Map<string, TickerPrice>>(
    () => new Map(),
  );
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  const handlePrice = useCallback((event: PriceEvent) => {
    setPrices((prev) => {
      const next = new Map(prev);
      const existing = prev.get(event.ticker);

      const history = existing ? [...existing.history] : [];
      history.push({ price: event.price, timestamp: event.timestamp });
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }

      next.set(event.ticker, {
        ticker: event.ticker,
        price: event.price,
        previousPrice: event.previous_price,
        changeDirection: event.change_direction,
        timestamp: event.timestamp,
        history,
      });
      return next;
    });
  }, []);

  const handleStatus = useCallback((s: ConnectionStatus) => {
    setStatus(s);
  }, []);

  useEffect(() => {
    const client = new PriceSSEClient(handlePrice, handleStatus);
    client.connect();
    return () => client.close();
  }, [handlePrice, handleStatus]);

  return (
    <PriceContext.Provider value={{ prices, status }}>
      {children}
    </PriceContext.Provider>
  );
}

/** Read the current price map and connection status. */
export function usePrices(): PriceContextValue {
  return useContext(PriceContext);
}

/** Convenience hook: get a single ticker's price state (or undefined). */
export function useTickerPrice(ticker: string): TickerPrice | undefined {
  const { prices } = useContext(PriceContext);
  return prices.get(ticker);
}
