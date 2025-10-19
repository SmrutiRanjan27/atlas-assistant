"use client";

type ChatStatusIndicatorProps = {
  isStreaming: boolean;
  hasActiveConversation: boolean;
};

export function ChatStatusIndicator({ isStreaming, hasActiveConversation }: ChatStatusIndicatorProps) {
  return (
    <div className="text-[0.75rem] uppercase tracking-[0.2em] text-atlas-text-secondary">
      {isStreaming ? "Streaming response…" : hasActiveConversation ? "Standing by" : "Awaiting first query"}
    </div>
  );
}

