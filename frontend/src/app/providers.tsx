"use client";

import type { ReactNode } from "react";
import { PriceProvider } from "@/lib/price-context";
import { PortfolioProvider } from "@/lib/portfolio-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PriceProvider>
      <PortfolioProvider>{children}</PortfolioProvider>
    </PriceProvider>
  );
}
