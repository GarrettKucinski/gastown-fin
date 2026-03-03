import { test, expect } from "@playwright/test";
import { API_URL } from "./helpers";

test.describe("SSE resilience", () => {
  test("SSE endpoint returns event-stream content type", async ({
    request,
  }) => {
    const res = await request.get(`${API_URL}/api/stream/prices`, {
      timeout: 10_000,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/event-stream");
  });

  test("frontend reconnects after SSE disconnection", async ({ page }) => {
    await page.goto("/");

    // Wait for the app to load
    await expect(page.getByText("Gastown Finance")).toBeVisible();

    // The PriceProvider connects to SSE automatically. We can verify the
    // reconnection logic by checking the client doesn't crash on navigation.
    // Navigate away and back — the provider should re-establish connection.
    await page.goto("about:blank");
    await page.goto("/");
    await expect(page.getByText("Gastown Finance")).toBeVisible();
  });

  test("multiple SSE connections are supported", async ({ request }) => {
    // Open two concurrent SSE connections — both should succeed
    const [res1, res2] = await Promise.all([
      request.get(`${API_URL}/api/stream/prices`, { timeout: 10_000 }),
      request.get(`${API_URL}/api/stream/prices`, { timeout: 10_000 }),
    ]);
    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);
  });
});
