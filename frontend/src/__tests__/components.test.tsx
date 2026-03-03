import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

// Mock PriceSSEClient to prevent real EventSource usage
jest.mock("@/lib/sse-client", () => ({
  PriceSSEClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    close: jest.fn(),
  })),
}));

describe("Home page", () => {
  it("renders the app title", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /gastown finance/i }),
    ).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<Home />);

    expect(
      screen.getByText(/real-time trading dashboard/i),
    ).toBeInTheDocument();
  });
});
