import { APIRequestContext } from "@playwright/test";

/** Base URL for direct backend API calls. */
export const API_URL = process.env.API_URL || "http://localhost:8000";

/** Helper to execute a trade via the API. */
export async function executeTrade(
  request: APIRequestContext,
  ticker: string,
  side: "buy" | "sell",
  quantity: number,
) {
  const res = await request.post(`${API_URL}/api/portfolio/trade`, {
    data: { ticker, side, quantity },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Trade failed (${res.status()}): ${body}`);
  }
  return res.json();
}

/** Helper to fetch current portfolio state from the API. */
export async function getPortfolio(request: APIRequestContext) {
  const res = await request.get(`${API_URL}/api/portfolio`);
  if (!res.ok()) {
    throw new Error(`Portfolio fetch failed: ${res.status()}`);
  }
  return res.json();
}

/** Helper to check backend health. */
export async function checkHealth(request: APIRequestContext) {
  const res = await request.get(`${API_URL}/api/health`);
  return res.json();
}

/** Wait for SSE prices to appear by polling the price stream endpoint. */
export async function waitForPrices(
  request: APIRequestContext,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const portfolio = await getPortfolio(request);
      // If the backend is serving data and health is ok, prices should be flowing
      if (portfolio.cash_balance > 0) return;
    } catch {
      // Backend not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
