"use client";

import clsx from "clsx";

import { ConversationSummary } from "../hooks/useChatPage";

type ChatHistoryPanelProps = {
  open: boolean;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  isLoading: boolean;
  disableInteractions: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void | Promise<void>;
  onDeleteConversation: (conversationId: string) => void | Promise<void>;
  onNewConversation: () => void | Promise<void>;
  formatTimestamp: (iso: string) => string;
};

export function ChatHistoryPanel({
  open,
  conversations,
  activeConversationId,
  isLoading,
  disableInteractions,
  onClose,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  formatTimestamp,
}: ChatHistoryPanelProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[rgba(6,11,34,0.7)] backdrop-blur-lg">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close conversation history"
      />
      <aside
        className="relative z-10 flex h-full w-full max-w-sm flex-col gap-5 border border-[rgba(124,108,255,0.35)] bg-[rgba(16,21,42,0.95)] p-6 shadow-atlas-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-atlas-text">Conversation History</div>
            <p className="text-xs uppercase tracking-[0.28em] text-atlas-text-secondary">
              Resume, branch, or curate threads
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[rgba(124,108,255,0.35)] px-3 py-1 text-xs uppercase tracking-[0.28em] text-atlas-text-secondary transition hover:border-[rgba(124,108,255,0.6)] hover:text-atlas-accent-strong"
          >
            Close
          </button>
        </div>
        <button
          type="button"
          onClick={() => void onNewConversation()}
          disabled={disableInteractions}
          className="rounded-[18px] border border-[rgba(124,108,255,0.4)] bg-[rgba(8,12,28,0.8)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-atlas-accent-strong transition hover:border-[rgba(124,108,255,0.65)] hover:text-atlas-text disabled:cursor-not-allowed disabled:opacity-60"
        >
          New Chat
        </button>
        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.55)] px-4 py-6 text-center text-sm text-atlas-text-secondary">
              Loading conversations…
            </div>
          ) : conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.55)] px-4 py-6 text-center text-sm text-atlas-text-secondary">
              No conversations yet. Start a new chat to begin.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <li key={conversation.id}>
                    <div
                      className={clsx(
                        "rounded-2xl border px-4 py-4 shadow-atlas-chat transition",
                        isActive
                          ? "border-[rgba(124,108,255,0.6)] bg-[rgba(30,36,78,0.9)]"
                          : "border-[rgba(124,108,255,0.2)] bg-[rgba(12,18,36,0.78)] hover:border-[rgba(124,108,255,0.45)] hover:bg-[rgba(18,24,52,0.9)]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          className={clsx(
                            "flex-1 text-left text-sm font-semibold text-atlas-text transition",
                            disableInteractions && "cursor-not-allowed opacity-70",
                          )}
                          onClick={() => void onSelectConversation(conversation.id)}
                          disabled={disableInteractions}
                        >
                          <div>{conversation.title}</div>
                          <div className="mt-2 text-[0.7rem] uppercase tracking-[0.28em] text-atlas-text-secondary">
                            {`Updated ${formatTimestamp(conversation.updatedAt)}`}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteConversation(conversation.id)}
                          className="rounded-full border border-transparent px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-atlas-text-secondary transition hover:border-[rgba(255,92,128,0.4)] hover:text-atlas-danger disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={disableInteractions}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

