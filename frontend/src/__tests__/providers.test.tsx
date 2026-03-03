import { render, screen } from "@testing-library/react";
import { Providers } from "@/app/providers";

// Mock PriceSSEClient to prevent real EventSource usage
jest.mock("@/lib/sse-client", () => ({
  PriceSSEClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    close: jest.fn(),
  })),
}));

describe("Providers", () => {
  it("renders children within the provider tree", () => {
    render(
      <Providers>
        <div data-testid="child">Hello</div>
      </Providers>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("wraps children in PriceProvider context", async () => {
    // Verify the PriceSSEClient constructor was called when Providers mounts,
    // confirming PriceProvider is in the tree.
    const { PriceSSEClient } = jest.requireMock("@/lib/sse-client");
    PriceSSEClient.mockClear();

    render(
      <Providers>
        <span>test</span>
      </Providers>,
    );

    expect(PriceSSEClient).toHaveBeenCalledTimes(1);
  });
});
