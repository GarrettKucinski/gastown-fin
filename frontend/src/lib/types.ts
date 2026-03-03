/** Price event as received from the SSE backend. */
export interface PriceEvent {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change_direction: "up" | "down" | "flat";
}

/** A single point in the price history array (for sparklines). */
export interface PricePoint {
  price: number;
  timestamp: number;
}

/** Full price state for a single ticker. */
export interface TickerPrice {
  ticker: string;
  price: number;
  previousPrice: number;
  changeDirection: "up" | "down" | "flat";
  timestamp: number;
  history: PricePoint[];
}

/** Connection status for the SSE client. */
export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";
