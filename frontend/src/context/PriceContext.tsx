"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePriceStream, type PriceTick, type PriceHistory } from "@/hooks/usePriceStream";

interface PriceContextValue {
  latest: Map<string, PriceTick>;
  history: Map<string, PriceHistory[]>;
  connected: boolean;
  selectedTicker: string;
  setSelectedTicker: (ticker: string) => void;
}

const PriceContext = createContext<PriceContextValue | null>(null);

const DEFAULT_TICKER = "AAPL";

export function PriceProvider({ children }: { children: ReactNode }) {
  const { latest, history, connected } = usePriceStream();
  const [selectedTicker, setSelectedTicker] = useState(DEFAULT_TICKER);

  return (
    <PriceContext.Provider
      value={{ latest, history, connected, selectedTicker, setSelectedTicker }}
    >
      {children}
    </PriceContext.Provider>
  );
}

export function usePriceContext() {
  const ctx = useContext(PriceContext);
  if (!ctx) {
    throw new Error("usePriceContext must be used within PriceProvider");
  }
  return ctx;
}
