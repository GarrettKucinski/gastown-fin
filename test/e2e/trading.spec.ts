import { test, expect } from "@playwright/test";
import {
  API_URL,
  executeTrade,
  getPortfolio,
  waitForPrices,
} from "./helpers";

test.describe("Trading", () => {
  test.beforeEach(async ({ request }) => {
    await waitForPrices(request);
  });

  test("buy shares: cash decreases and position appears", async ({
    request,
  }) => {
    const before = await getPortfolio(request);
    const initialCash = before.cash_balance;

    // Buy 10 shares of AAPL
    const trade = await executeTrade(request, "AAPL", "buy", 10);
    expect(trade.symbol).toBe("AAPL");
    expect(trade.side).toBe("buy");
    expect(trade.quantity).toBe(10);
    expect(trade.price).toBeGreaterThan(0);
    expect(trade.total).toBeGreaterThan(0);

    // Verify portfolio updated
    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeLessThan(initialCash);
    expect(after.cash_balance).toBeCloseTo(
      initialCash - trade.total,
      1, // within $0.1 tolerance due to rounding
    );

    // Position should exist
    const position = after.positions.find(
      (p: { symbol: string }) => p.symbol === "AAPL",
    );
    expect(position).toBeDefined();
    expect(position.quantity).toBeGreaterThanOrEqual(10);
  });

  test("sell shares: cash increases and position updates", async ({
    request,
  }) => {
    // First buy some shares
    await executeTrade(request, "MSFT", "buy", 20);
    const afterBuy = await getPortfolio(request);
    const buyPosition = afterBuy.positions.find(
      (p: { symbol: string }) => p.symbol === "MSFT",
    );
    expect(buyPosition).toBeDefined();

    const cashBeforeSell = afterBuy.cash_balance;

    // Sell half
    const sellTrade = await executeTrade(request, "MSFT", "sell", 10);
    expect(sellTrade.side).toBe("sell");
    expect(sellTrade.quantity).toBe(10);

    const afterSell = await getPortfolio(request);
    expect(afterSell.cash_balance).toBeGreaterThan(cashBeforeSell);

    // Position should still exist with reduced quantity
    const remaining = afterSell.positions.find(
      (p: { symbol: string }) => p.symbol === "MSFT",
    );
    expect(remaining).toBeDefined();
    expect(remaining.quantity).toBeCloseTo(
      buyPosition.quantity - 10,
      4,
    );
  });

  test("sell all shares removes position", async ({ request }) => {
    // Buy then sell all
    await executeTrade(request, "GOOGL", "buy", 5);
    const afterBuy = await getPortfolio(request);
    const pos = afterBuy.positions.find(
      (p: { symbol: string }) => p.symbol === "GOOGL",
    );
    expect(pos).toBeDefined();

    await executeTrade(request, "GOOGL", "sell", pos.quantity);
    const afterSell = await getPortfolio(request);
    const removedPos = afterSell.positions.find(
      (p: { symbol: string }) => p.symbol === "GOOGL",
    );
    expect(removedPos).toBeUndefined();
  });

  test("cannot sell more shares than held", async ({ request }) => {
    const res = await request.post(`${API_URL}/api/portfolio/trade`, {
      data: { ticker: "NVDA", side: "sell", quantity: 99999 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Insufficient shares");
  });

  test("cannot buy with insufficient cash", async ({ request }) => {
    // Attempt to buy a huge quantity that exceeds cash balance
    const res = await request.post(`${API_URL}/api/portfolio/trade`, {
      data: { ticker: "AAPL", side: "buy", quantity: 999999 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("Insufficient cash");
  });
});
