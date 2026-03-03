import { test, expect } from "@playwright/test";
import {
  API_URL,
  executeTrade,
  getPortfolio,
  waitForPrices,
} from "./helpers";

test.describe("Portfolio", () => {
  test.beforeEach(async ({ request }) => {
    await waitForPrices(request);
  });

  test("portfolio total value includes cash and positions", async ({
    request,
  }) => {
    // Buy some shares first
    await executeTrade(request, "TSLA", "buy", 5);
    const portfolio = await getPortfolio(request);

    expect(portfolio.cash_balance).toBeGreaterThan(0);
    expect(portfolio.total_value).toBeGreaterThanOrEqual(
      portfolio.cash_balance,
    );

    // If there are positions, total should exceed cash
    if (portfolio.positions.length > 0) {
      const positionsWithPrice = portfolio.positions.filter(
        (p: { current_price: number | null }) => p.current_price !== null,
      );
      if (positionsWithPrice.length > 0) {
        expect(portfolio.total_value).toBeGreaterThan(
          portfolio.cash_balance,
        );
      }
    }
  });

  test("positions show unrealized P&L", async ({ request }) => {
    await executeTrade(request, "META", "buy", 3);
    const portfolio = await getPortfolio(request);

    const metaPos = portfolio.positions.find(
      (p: { symbol: string }) => p.symbol === "META",
    );
    expect(metaPos).toBeDefined();
    expect(metaPos.avg_cost).toBeGreaterThan(0);
    expect(metaPos.current_price).toBeGreaterThan(0);

    // P&L fields should be populated (could be positive or negative)
    expect(metaPos.market_value).toBeDefined();
    expect(metaPos.unrealized_pnl).toBeDefined();
    expect(metaPos.unrealized_pnl_pct).toBeDefined();
  });

  test("portfolio history endpoint returns snapshots array", async ({
    request,
  }) => {
    const res = await request.get(`${API_URL}/api/portfolio/history`);
    expect(res.ok()).toBe(true);

    const data = await res.json();
    expect(data).toHaveProperty("snapshots");
    expect(Array.isArray(data.snapshots)).toBe(true);
  });
});
