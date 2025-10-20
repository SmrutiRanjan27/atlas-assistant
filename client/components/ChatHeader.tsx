"use client";

import { UserProfile } from "./UserProfile";

type ChatHeaderProps = {
  onOpenHistory: () => void;
  onStartNewConversation: () => void | Promise<void>;
  disableInteractions: boolean;
};

export function ChatHeader({ onOpenHistory, onStartNewConversation, disableInteractions }: ChatHeaderProps) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="text-3xl font-semibold tracking-tight md:text-[2.3rem]">Atlas Assistant</div>
        <p className="mt-2 max-w-xl text-sm text-atlas-text-secondary md:text-[0.95rem]">
          Ask research questions and watch tool-assisted thinking unfold in real-time.
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={onOpenHistory}
          className="rounded-2xl border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-atlas-accent-strong transition hover:border-[rgba(124,108,255,0.55)] hover:text-atlas-text"
        >
          History
        </button>
        <button
          type="button"
          onClick={() => void onStartNewConversation()}
          disabled={disableInteractions}
          className="rounded-2xl bg-gradient-to-r from-[rgba(124,108,255,0.95)] to-[rgba(42,229,185,0.9)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-atlas-text transition hover:translate-y-[-1px] hover:shadow-[0_12px_28px_rgba(124,108,255,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          New Chat
        </button>
        <UserProfile />
      </div>
    </header>
  );
}

