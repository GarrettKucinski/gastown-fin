"use client";

import type { ChatMessage as ChatMessageType } from "@/lib/types";

/** Patterns for detecting trade action confirmations in assistant messages. */
const ACTION_PATTERN =
  /\b(Bought|Sold|Added|Removed)\s+(\d+\.?\d*)\s+(\w{1,5})\s*(?:@\s*\$?([\d,.]+))?/gi;

function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Code blocks (```)
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre class="bg-bg-primary rounded px-3 py-2 my-2 overflow-x-auto text-sm"><code>$2</code></pre>',
    )
    // Inline code
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-bg-primary rounded px-1 py-0.5 text-sm text-accent-blue">$1</code>',
    )
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Line breaks
    .replace(/\n/g, "<br />");

  return html;
}

function ActionBadge({ text }: { text: string }) {
  const isBuy = /bought|added/i.test(text);
  const colorClass = isBuy
    ? "bg-green-900/40 text-green-400 border-green-800/50"
    : "bg-red-900/40 text-red-400 border-red-800/50";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      <span className="text-[10px]">{isBuy ? "\u25B2" : "\u25BC"}</span>
      {text}
    </span>
  );
}

export function ChatMessageBubble({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";

  // Extract action confirmations from assistant messages
  const actions: string[] = [];
  if (!isUser) {
    let match: RegExpExecArray | null;
    const re = new RegExp(ACTION_PATTERN.source, ACTION_PATTERN.flags);
    while ((match = re.exec(message.content)) !== null) {
      actions.push(match[0]);
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-accent-blue/20 text-text-primary border border-accent-blue/30"
            : "bg-bg-secondary text-text-primary border border-border"
        }`}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <>
            <div
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(message.content),
              }}
            />
            {actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {actions.map((action, i) => (
                  <ActionBadge key={i} text={action} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
