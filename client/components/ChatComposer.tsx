"use client";

import { FormEvent } from "react";

type ChatComposerProps = {
  input: string;
  onInputChange: (value: string) => void;
  isStreaming: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export function ChatComposer({ input, onInputChange, isStreaming, onSubmit }: ChatComposerProps) {
  return (
    <form className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4" onSubmit={onSubmit}>
      <input
        className="rounded-[18px] border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.78)] px-5 py-3 text-base text-atlas-text outline-none transition focus:border-[rgba(124,108,255,0.75)] focus:shadow-[0_0_0_4px_rgba(124,108,255,0.12)] disabled:opacity-60"
        name="message"
        placeholder="Search anything – trending topics, deep research, quick facts…"
        value={input}
        disabled={isStreaming}
        onChange={(event) => onInputChange(event.target.value)}
        autoComplete="off"
      />
      <button
        className="min-w-[120px] rounded-2xl bg-gradient-to-r from-[rgba(124,108,255,0.95)] to-[rgba(42,229,185,0.9)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-atlas-text transition hover:translate-y-[-1px] hover:shadow-[0_12px_28px_rgba(124,108,255,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={isStreaming}
      >
        {isStreaming ? "Streaming…" : "Send"}
      </button>
    </form>
  );
}

