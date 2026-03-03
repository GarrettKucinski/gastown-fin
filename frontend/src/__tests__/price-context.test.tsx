import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { PriceProvider, usePrices, useTickerPrice } from "@/lib/price-context";
import type { PriceEvent } from "@/lib/types";
import type { PriceCallback, StatusCallback } from "@/lib/sse-client";

// ---------- Mock PriceSSEClient ----------

let capturedOnPrice: PriceCallback;
let capturedOnStatus: StatusCallback;
const mockConnect = jest.fn();
const mockClose = jest.fn();

jest.mock("@/lib/sse-client", () => ({
  PriceSSEClient: jest.fn().mockImplementation(
    (onPrice: PriceCallback, onStatus: StatusCallback) => {
      capturedOnPrice = onPrice;
      capturedOnStatus = onStatus;
      return { connect: mockConnect, close: mockClose };
    },
  ),
}));

// ---------- Helpers ----------

function wrapper({ children }: { children: ReactNode }) {
  return <PriceProvider>{children}</PriceProvider>;
}

function makePriceEvent(overrides: Partial<PriceEvent> = {}): PriceEvent {
  return {
    ticker: "AAPL",
    price: 176.5,
    previous_price: 175.0,
    timestamp: 1000,
    change_direction: "up",
    ...overrides,
  };
}

// ---------- Setup ----------

beforeEach(() => {
  mockConnect.mockClear();
  mockClose.mockClear();
});

// ---------- Tests ----------

describe("PriceProvider", () => {
  describe("SSE client lifecycle", () => {
    it("creates and connects a PriceSSEClient on mount", () => {
      renderHook(() => usePrices(), { wrapper });

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it("closes the SSE client on unmount", () => {
      const { unmount } = renderHook(() => usePrices(), { wrapper });

      unmount();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("initial state", () => {
    it("starts with an empty prices map", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      expect(result.current.prices.size).toBe(0);
    });

    it("starts with 'disconnected' status", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      expect(result.current.status).toBe("disconnected");
    });
  });

  describe("connection status tracking", () => {
    it("updates status to 'connected'", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() => capturedOnStatus("connected"));

      expect(result.current.status).toBe("connected");
    });

    it("updates status to 'reconnecting'", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() => capturedOnStatus("reconnecting"));

      expect(result.current.status).toBe("reconnecting");
    });
  });

  describe("price event handling", () => {
    it("adds a new ticker to the prices map", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() => capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 176.5 })));

      expect(result.current.prices.size).toBe(1);
      const aapl = result.current.prices.get("AAPL");
      expect(aapl).toBeDefined();
      expect(aapl!.price).toBe(176.5);
      expect(aapl!.ticker).toBe("AAPL");
    });

    it("updates an existing ticker with new price data", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() => capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 175.0 })));
      act(() => capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 176.5 })));

      const aapl = result.current.prices.get("AAPL");
      expect(aapl!.price).toBe(176.5);
    });

    it("tracks multiple tickers independently", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() => {
        capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 176.0 }));
        capturedOnPrice(makePriceEvent({ ticker: "MSFT", price: 415.0 }));
        capturedOnPrice(makePriceEvent({ ticker: "GOOGL", price: 170.0 }));
      });

      expect(result.current.prices.size).toBe(3);
      expect(result.current.prices.get("AAPL")!.price).toBe(176.0);
      expect(result.current.prices.get("MSFT")!.price).toBe(415.0);
      expect(result.current.prices.get("GOOGL")!.price).toBe(170.0);
    });

    it("maps snake_case fields to camelCase", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() =>
        capturedOnPrice(
          makePriceEvent({
            previous_price: 174.0,
            change_direction: "down",
          }),
        ),
      );

      const aapl = result.current.prices.get("AAPL")!;
      expect(aapl.previousPrice).toBe(174.0);
      expect(aapl.changeDirection).toBe("down");
    });
  });

  describe("price flash animation triggers (changeDirection)", () => {
    it("tracks 'up' direction for price increases", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() =>
        capturedOnPrice(
          makePriceEvent({
            price: 180.0,
            previous_price: 175.0,
            change_direction: "up",
          }),
        ),
      );

      expect(result.current.prices.get("AAPL")!.changeDirection).toBe("up");
    });

    it("tracks 'down' direction for price decreases", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() =>
        capturedOnPrice(
          makePriceEvent({
            price: 170.0,
            previous_price: 175.0,
            change_direction: "down",
          }),
        ),
      );

      expect(result.current.prices.get("AAPL")!.changeDirection).toBe("down");
    });

    it("tracks 'flat' direction when price is unchanged", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() =>
        capturedOnPrice(
          makePriceEvent({
            price: 175.0,
            previous_price: 175.0,
            change_direction: "flat",
          }),
        ),
      );

      expect(result.current.prices.get("AAPL")!.changeDirection).toBe("flat");
    });

    it("updates direction on each price tick (flash trigger)", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      // Price goes up
      act(() =>
        capturedOnPrice(
          makePriceEvent({ price: 176.0, change_direction: "up" }),
        ),
      );
      expect(result.current.prices.get("AAPL")!.changeDirection).toBe("up");

      // Price goes down
      act(() =>
        capturedOnPrice(
          makePriceEvent({ price: 175.5, change_direction: "down" }),
        ),
      );
      expect(result.current.prices.get("AAPL")!.changeDirection).toBe("down");

      // Price stays flat
      act(() =>
        capturedOnPrice(
          makePriceEvent({ price: 175.5, change_direction: "flat" }),
        ),
      );
      expect(result.current.prices.get("AAPL")!.changeDirection).toBe("flat");
    });

    it("preserves previousPrice for flash animation calculations", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() =>
        capturedOnPrice(
          makePriceEvent({
            price: 180.0,
            previous_price: 175.0,
            change_direction: "up",
          }),
        ),
      );

      const aapl = result.current.prices.get("AAPL")!;
      expect(aapl.price).toBe(180.0);
      expect(aapl.previousPrice).toBe(175.0);
      // Consumer can compute flash magnitude: price - previousPrice = +5
    });
  });

  describe("price history management", () => {
    it("builds history array from successive events", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() => {
        capturedOnPrice(makePriceEvent({ price: 175.0, timestamp: 1000 }));
        capturedOnPrice(makePriceEvent({ price: 176.0, timestamp: 2000 }));
        capturedOnPrice(makePriceEvent({ price: 176.5, timestamp: 3000 }));
      });

      const history = result.current.prices.get("AAPL")!.history;
      expect(history).toHaveLength(3);
      expect(history[0]).toEqual({ price: 175.0, timestamp: 1000 });
      expect(history[1]).toEqual({ price: 176.0, timestamp: 2000 });
      expect(history[2]).toEqual({ price: 176.5, timestamp: 3000 });
    });

    it("caps history at 500 entries", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() => {
        for (let i = 0; i < 510; i++) {
          capturedOnPrice(
            makePriceEvent({ price: 175 + i * 0.01, timestamp: i }),
          );
        }
      });

      const history = result.current.prices.get("AAPL")!.history;
      expect(history).toHaveLength(500);
      // Oldest entries should have been evicted; first entry should be index 10
      expect(history[0].timestamp).toBe(10);
    });

    it("maintains separate history per ticker", () => {
      const { result } = renderHook(() => usePrices(), { wrapper });

      act(() => {
        capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 175.0, timestamp: 1 }));
        capturedOnPrice(makePriceEvent({ ticker: "MSFT", price: 415.0, timestamp: 2 }));
        capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 176.0, timestamp: 3 }));
      });

      expect(result.current.prices.get("AAPL")!.history).toHaveLength(2);
      expect(result.current.prices.get("MSFT")!.history).toHaveLength(1);
    });
  });
});

describe("usePrices hook", () => {
  it("returns the full context value", () => {
    const { result } = renderHook(() => usePrices(), { wrapper });

    expect(result.current).toHaveProperty("prices");
    expect(result.current).toHaveProperty("status");
    expect(result.current.prices).toBeInstanceOf(Map);
  });
});

describe("useTickerPrice hook", () => {
  it("returns undefined for an unknown ticker", () => {
    const { result } = renderHook(() => useTickerPrice("UNKNOWN"), { wrapper });

    expect(result.current).toBeUndefined();
  });

  it("returns the TickerPrice for a known ticker", () => {
    const { result } = renderHook(() => useTickerPrice("AAPL"), { wrapper });

    act(() =>
      capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 176.5 })),
    );

    expect(result.current).toBeDefined();
    expect(result.current!.price).toBe(176.5);
    expect(result.current!.ticker).toBe("AAPL");
  });

  it("updates when its ticker receives a new price", () => {
    const { result } = renderHook(() => useTickerPrice("AAPL"), { wrapper });

    act(() =>
      capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 175.0 })),
    );
    expect(result.current!.price).toBe(175.0);

    act(() =>
      capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 178.0 })),
    );
    expect(result.current!.price).toBe(178.0);
  });

  it("is not affected by other tickers' updates", () => {
    const { result } = renderHook(() => useTickerPrice("AAPL"), { wrapper });

    act(() => {
      capturedOnPrice(makePriceEvent({ ticker: "AAPL", price: 176.0 }));
      capturedOnPrice(makePriceEvent({ ticker: "MSFT", price: 420.0 }));
    });

    expect(result.current!.ticker).toBe("AAPL");
    expect(result.current!.price).toBe(176.0);
  });
});
