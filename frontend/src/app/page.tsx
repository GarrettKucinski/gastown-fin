"use client";

import { useState } from "react";
import { WatchlistPanel } from "@/components";

export default function Home() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Watchlist sidebar */}
      <aside className="w-[420px] flex-shrink-0 border-r border-border">
        <WatchlistPanel
          selectedTicker={selectedTicker}
          onSelectTicker={setSelectedTicker}
        />
      </aside>

      {/* Main chart area (placeholder for gf-5xz.1) */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          {selectedTicker ? (
            <>
              <h2 className="text-2xl font-bold text-accent-yellow mb-2">
                {selectedTicker}
              </h2>
              <p className="text-text-secondary">
                Chart view coming soon
              </p>
            </>
          ) : (
            <p className="text-text-secondary">
              Select a ticker from the watchlist
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
