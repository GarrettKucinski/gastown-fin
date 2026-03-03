"use client";

import { useState } from "react";

interface AddTickerFormProps {
  onAdd: (ticker: string) => void;
  disabled?: boolean;
}

/**
 * Inline form for adding a ticker to the watchlist.
 *
 * Validates 1-5 uppercase alpha characters before submitting.
 */
export function AddTickerForm({ onAdd, disabled }: AddTickerFormProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();

    if (!/^[A-Z]{1,5}$/.test(ticker)) {
      setError("Enter 1-5 letter ticker symbol");
      return;
    }

    setError(null);
    onAdd(ticker);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        placeholder="Add ticker..."
        maxLength={5}
        disabled={disabled}
        className="
          flex-1 bg-bg-primary border border-border rounded px-3 py-1.5
          text-sm text-text-primary placeholder:text-text-secondary/50
          focus:outline-none focus:border-accent-blue
          disabled:opacity-50
        "
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="
          px-3 py-1.5 rounded text-sm font-medium
          bg-accent-blue/20 text-accent-blue border border-accent-blue/30
          hover:bg-accent-blue/30 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        Add
      </button>
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </form>
  );
}
