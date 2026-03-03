"use client";

import { useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        role: "assistant",
        content: "AI chat integration coming soon.",
      },
    ]);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          AI Assistant
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-text-secondary text-center py-4">
            Ask questions about the market or your portfolio
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-xs p-2 rounded ${
              msg.role === "user"
                ? "bg-accent-blue/10 text-text-primary ml-4"
                : "bg-white/5 text-text-secondary mr-4"
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border p-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about markets..."
            className="flex-1 rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/50 focus:border-accent-blue focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-accent-purple px-3 py-1 text-xs font-semibold text-white hover:bg-accent-purple/80 transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
