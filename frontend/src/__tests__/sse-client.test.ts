import { PriceSSEClient } from "@/lib/sse-client";
import type { PriceEvent, ConnectionStatus } from "@/lib/types";

// ---------- EventSource mock ----------

type ESListener = ((evt: MessageEvent) => void) | null;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onmessage: ESListener = null;
  onerror: (() => void) | null = null;
  readyState = 0; // CONNECTING
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
    this.readyState = 2; // CLOSED
  }

  // --- helpers for tests ---

  /** Simulate a successful connection. */
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  /** Simulate receiving a message. */
  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  /** Simulate a connection error. */
  simulateError() {
    this.onerror?.();
  }
}

// Install mock globally
beforeAll(() => {
  (globalThis as Record<string, unknown>).EventSource = MockEventSource;
});

beforeEach(() => {
  MockEventSource.instances = [];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------- Helpers ----------

function latestES(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

function makePriceEvent(overrides: Partial<PriceEvent> = {}): PriceEvent {
  return {
    ticker: "AAPL",
    price: 176.5,
    previous_price: 175.0,
    timestamp: Date.now(),
    change_direction: "up",
    ...overrides,
  };
}

// ---------- Tests ----------

describe("PriceSSEClient", () => {
  describe("connection lifecycle", () => {
    it("creates an EventSource on connect()", () => {
      const client = new PriceSSEClient(jest.fn(), jest.fn());
      client.connect();

      expect(MockEventSource.instances).toHaveLength(1);
      expect(latestES().url).toBe("/api/stream/prices");
    });

    it("reports 'connected' on successful open", () => {
      const onStatus = jest.fn();
      const client = new PriceSSEClient(jest.fn(), onStatus);

      client.connect();
      latestES().simulateOpen();

      expect(onStatus).toHaveBeenCalledWith("connected");
    });

    it("reports 'disconnected' on close()", () => {
      const onStatus = jest.fn();
      const client = new PriceSSEClient(jest.fn(), onStatus);

      client.connect();
      latestES().simulateOpen();
      onStatus.mockClear();

      client.close();

      expect(onStatus).toHaveBeenCalledWith("disconnected");
    });

    it("closes the underlying EventSource on close()", () => {
      const client = new PriceSSEClient(jest.fn(), jest.fn());
      client.connect();

      const es = latestES();
      client.close();

      expect(es.closed).toBe(true);
    });
  });

  describe("message handling", () => {
    it("parses and forwards valid price events", () => {
      const onPrice = jest.fn();
      const client = new PriceSSEClient(onPrice, jest.fn());

      client.connect();
      latestES().simulateOpen();

      const event = makePriceEvent({ ticker: "MSFT", price: 420.0 });
      latestES().simulateMessage(event);

      expect(onPrice).toHaveBeenCalledTimes(1);
      expect(onPrice).toHaveBeenCalledWith(event);
    });

    it("ignores malformed JSON messages", () => {
      const onPrice = jest.fn();
      const client = new PriceSSEClient(onPrice, jest.fn());

      client.connect();
      latestES().simulateOpen();

      // Send raw invalid data - bypass simulateMessage to send bad JSON
      latestES().onmessage?.(new MessageEvent("message", { data: "not json" }));

      expect(onPrice).not.toHaveBeenCalled();
    });

    it("delivers multiple price events in sequence", () => {
      const onPrice = jest.fn();
      const client = new PriceSSEClient(onPrice, jest.fn());

      client.connect();
      latestES().simulateOpen();

      const events = [
        makePriceEvent({ ticker: "AAPL", price: 176.0 }),
        makePriceEvent({ ticker: "GOOGL", price: 171.0 }),
        makePriceEvent({ ticker: "AAPL", price: 176.5 }),
      ];

      events.forEach((e) => latestES().simulateMessage(e));

      expect(onPrice).toHaveBeenCalledTimes(3);
      expect(onPrice).toHaveBeenNthCalledWith(1, events[0]);
      expect(onPrice).toHaveBeenNthCalledWith(2, events[1]);
      expect(onPrice).toHaveBeenNthCalledWith(3, events[2]);
    });
  });

  describe("reconnection with exponential backoff", () => {
    it("reports 'reconnecting' on error", () => {
      const onStatus = jest.fn();
      const client = new PriceSSEClient(jest.fn(), onStatus);

      client.connect();
      latestES().simulateOpen();
      onStatus.mockClear();

      latestES().simulateError();

      expect(onStatus).toHaveBeenCalledWith("reconnecting");
    });

    it("reconnects after 1s on first failure", () => {
      const client = new PriceSSEClient(jest.fn(), jest.fn());

      client.connect();
      latestES().simulateOpen();

      const firstES = latestES();
      firstES.simulateError();

      expect(MockEventSource.instances).toHaveLength(1);

      // Advance past the 1s retry delay
      jest.advanceTimersByTime(1_000);

      expect(MockEventSource.instances).toHaveLength(2);
      expect(latestES()).not.toBe(firstES);
    });

    it("applies exponential backoff on repeated failures", () => {
      const client = new PriceSSEClient(jest.fn(), jest.fn());

      client.connect();

      // Fail 3 times: expect delays of 1s, 2s, 4s
      for (let i = 0; i < 3; i++) {
        latestES().simulateError();
        const expectedDelay = 1_000 * Math.pow(2, i);

        // Not yet reconnected just before the delay
        jest.advanceTimersByTime(expectedDelay - 1);
        const countBefore = MockEventSource.instances.length;

        jest.advanceTimersByTime(1);
        expect(MockEventSource.instances.length).toBe(countBefore + 1);
      }
    });

    it("caps retry delay at 30 seconds", () => {
      const client = new PriceSSEClient(jest.fn(), jest.fn());

      client.connect();

      // Fail many times to exceed the 30s cap
      for (let i = 0; i < 10; i++) {
        latestES().simulateError();
        jest.advanceTimersByTime(30_000);
      }

      // After 10 failures the count should still match
      // (1 initial + 10 reconnects = 11)
      expect(MockEventSource.instances).toHaveLength(11);
    });

    it("resets retry count after a successful connection", () => {
      const client = new PriceSSEClient(jest.fn(), jest.fn());

      client.connect();

      // Fail twice: delays 1s, 2s
      latestES().simulateError();
      jest.advanceTimersByTime(1_000);
      latestES().simulateError();
      jest.advanceTimersByTime(2_000);

      // Now succeed
      latestES().simulateOpen();

      // Next failure should reset to 1s delay
      const countBefore = MockEventSource.instances.length;
      latestES().simulateError();
      jest.advanceTimersByTime(999);
      expect(MockEventSource.instances.length).toBe(countBefore);
      jest.advanceTimersByTime(1);
      expect(MockEventSource.instances.length).toBe(countBefore + 1);
    });

    it("does not reconnect after close()", () => {
      const client = new PriceSSEClient(jest.fn(), jest.fn());

      client.connect();
      latestES().simulateOpen();

      client.close();

      // Advance well past any retry delay
      jest.advanceTimersByTime(60_000);

      // Only the original connection was created
      expect(MockEventSource.instances).toHaveLength(1);
    });

    it("cancels pending retry timer on close()", () => {
      const client = new PriceSSEClient(jest.fn(), jest.fn());

      client.connect();
      latestES().simulateError(); // schedules a 1s retry

      client.close();
      jest.advanceTimersByTime(5_000);

      // Only the original connection was created — no retry
      expect(MockEventSource.instances).toHaveLength(1);
    });
  });
});
