import type { PriceEvent, ConnectionStatus } from "./types";

export type StatusCallback = (status: ConnectionStatus) => void;
export type PriceCallback = (event: PriceEvent) => void;

const SSE_URL = "/api/stream/prices";
const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * SSE client for real-time price streaming.
 *
 * Wraps the browser EventSource API with:
 * - Connection status tracking (connected / reconnecting / disconnected)
 * - Exponential backoff on repeated failures
 * - Clean teardown via close()
 */
export class PriceSSEClient {
  private es: EventSource | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  private onStatus: StatusCallback;
  private onPrice: PriceCallback;

  constructor(onPrice: PriceCallback, onStatus: StatusCallback) {
    this.onPrice = onPrice;
    this.onStatus = onStatus;
  }

  /** Open the SSE connection. Safe to call multiple times. */
  connect(): void {
    this.closed = false;
    this.createConnection();
  }

  /** Permanently close the connection and stop reconnecting. */
  close(): void {
    this.closed = true;
    this.clearRetryTimer();
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.onStatus("disconnected");
  }

  private createConnection(): void {
    if (this.closed) return;

    this.clearRetryTimer();

    if (this.es) {
      this.es.close();
      this.es = null;
    }

    const es = new EventSource(SSE_URL);
    this.es = es;

    es.onopen = () => {
      this.retryCount = 0;
      this.onStatus("connected");
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        const data: PriceEvent = JSON.parse(event.data);
        this.onPrice(data);
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      if (this.closed) return;

      es.close();
      this.es = null;
      this.onStatus("reconnecting");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;

    const delay = Math.min(
      BASE_RETRY_MS * Math.pow(2, this.retryCount),
      MAX_RETRY_MS,
    );
    this.retryCount++;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.createConnection();
    }, delay);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
