"use client";

import type { ReactNode } from "react";
import { PriceProvider } from "@/lib/price-context";

export function Providers({ children }: { children: ReactNode }) {
  return <PriceProvider>{children}</PriceProvider>;
}
