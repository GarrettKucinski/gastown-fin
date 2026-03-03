"use client";

import TradeBar from "@/components/TradeBar";
import { PriceChart } from "@/components/PriceChart";

export default function Home() {
  return (
    <div className="h-[calc(100vh-49px)] flex flex-col">
      <PriceChart />
      <TradeBar />
    </div>
  );
}
