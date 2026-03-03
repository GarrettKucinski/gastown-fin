"use client";

import { useEffect, useRef, useState } from "react";

export interface PriceUpdate {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change_direction: "up" | "down" | "flat";
}

export type PriceMap = Map<string, PriceUpdate>;

/**
 * Subscribe to the SSE price stream and maintain a map of latest prices.
 * Reconnects automatically on disconnect.
 */
export function usePriceStream(): PriceMap {
  const [prices, setPrices] = useState<PriceMap>(new Map());
  const bufferRef = useRef<Map<string, PriceUpdate>>(new Map());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/stream/prices");

      es.onmessage = (event) => {
        const update: PriceUpdate = JSON.parse(event.data);
        bufferRef.current.set(update.ticker, update);

        // Batch state updates via requestAnimationFrame to avoid
        // re-rendering on every SSE message (~20/sec at 500ms × 10 tickers)
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            setPrices(new Map(bufferRef.current));
            rafRef.current = 0;
          });
        }
      };

      es.onerror = () => {
        es?.close();
        // Reconnect after 2 seconds
        reconnectTimeout = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(reconnectTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return prices;
}
