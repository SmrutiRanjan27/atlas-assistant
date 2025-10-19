"use client";

import { MutableRefObject } from "react";

import { ChatEntry } from "../hooks/useChatPage";
import { ChatMessage } from "./ChatMessage";

type ChatFeedProps = {
  feedRef: MutableRefObject<HTMLDivElement | null>;
  messages: ChatEntry[];
  isLoadingConversation: boolean;
};

export function ChatFeed({ feedRef, messages, isLoadingConversation }: ChatFeedProps) {
  return (
    <div ref={feedRef} className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto pr-1.5">
      {isLoadingConversation && (
        <div className="rounded-2xl border border-dashed border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.6)] px-4 py-6 text-center text-sm text-atlas-text-secondary">
          Loading conversation…
        </div>
      )}
      {!isLoadingConversation && messages.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[rgba(124,108,255,0.3)] bg-[rgba(8,12,28,0.55)] px-4 py-6 text-center text-sm text-atlas-text-secondary">
          Start a conversation to see model responses and live tool activity.
        </div>
      )}
      {messages.map((entry) => (
        <ChatMessage
          key={entry.id}
          role={entry.role}
          content={entry.content}
          isStreaming={entry.isStreaming}
          toolEvents={entry.toolEvents}
        />
      ))}
    </div>
  );
}
