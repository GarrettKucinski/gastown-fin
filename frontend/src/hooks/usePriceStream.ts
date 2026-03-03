"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface PriceTick {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change_direction: "up" | "down" | "flat";
}

export type PriceMap = Record<string, PriceTick>;

export interface PriceHistory {
  time: number;
  value: number;
}

interface PriceState {
  /** Latest tick per ticker */
  latest: Map<string, PriceTick>;
  /** Accumulated price history per ticker */
  history: Map<string, PriceHistory[]>;
}

export function usePriceStream() {
  const [state, setState] = useState<PriceState>({
    latest: new Map(),
    history: new Map(),
  });
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;

    const es = new EventSource("/api/stream/prices");
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const tick: PriceTick = JSON.parse(event.data);

        setState((prev) => {
          const nextLatest = new Map(prev.latest);
          nextLatest.set(tick.ticker, tick);

          const nextHistory = new Map(prev.history);
          const existing = nextHistory.get(tick.ticker) || [];

          // Use seconds for lightweight-charts (UTCTimestamp)
          const timeSec = Math.floor(tick.timestamp);

          // Deduplicate: if last entry has same second, update its value
          if (existing.length > 0 && existing[existing.length - 1].time === timeSec) {
            const updated = [...existing];
            updated[updated.length - 1] = { time: timeSec, value: tick.price };
            nextHistory.set(tick.ticker, updated);
          } else {
            nextHistory.set(tick.ticker, [
              ...existing,
              { time: timeSec, value: tick.price },
            ]);
          }

          return { latest: nextLatest, history: nextHistory };
        });
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      eventSourceRef.current = null;
      // Reconnect after a short delay
      setTimeout(connect, 2000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [connect]);

  return { ...state, connected };
}
