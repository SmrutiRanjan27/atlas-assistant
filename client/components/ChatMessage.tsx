import clsx from "clsx";
import { MarkdownContent } from "./MarkdownContent";
import { ToolEventCard } from "./ToolEventCard";
import { ToolEvent } from "../types";

export type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolEvents?: ToolEvent[];
};

export function ChatMessage({ role, content, isStreaming, toolEvents }: ChatMessageProps) {
  const isUser = role === "user";
  const showToolEvents = !isUser && toolEvents && toolEvents.length > 0;
  const shouldRenderAssistantText = !isUser && (content.trim().length > 0 || isStreaming);

  return (
    <div className={`flex max-w-[min(720px,75vw)] ${isUser ? "self-end" : "self-start"}`}>
      <div className="rounded-[22px] bg-gradient-to-br from-[rgba(124,108,255,0.5)] via-transparent to-[rgba(42,229,185,0.32)] p-[1px]">
        <div
          className={clsx(
            "relative rounded-[20px] border border-[rgba(124,108,255,0.28)]",
            "backdrop-blur-2xl px-5 py-4 shadow-atlas-chat transition-all duration-200",
            isUser ? "bg-[rgba(30,36,78,0.95)]" : "bg-[rgba(18,24,52,0.95)]",
            isStreaming && "border-[rgba(124,108,255,0.7)] shadow-atlas-chat-strong",
          )}
        >
          <div
            className={clsx(
              "text-xs font-medium uppercase tracking-[0.25em] mb-2",
              isUser ? "text-atlas-accent-strong" : "text-atlas-success",
            )}
          >
            {isUser ? "You" : "Atlas"}
          </div>
          {isUser ? (
            <div className="text-base leading-relaxed whitespace-pre-wrap text-atlas-text">
              {content || (isStreaming ? "…" : "")}
            </div>
          ) : (
            <div className={clsx("flex flex-col", showToolEvents ? "gap-4" : "gap-2")}>
              {showToolEvents && (
                <div className="flex flex-col gap-3">
                  {toolEvents!.map((event) => (
                    <ToolEventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
              {shouldRenderAssistantText && (
                <div className="text-base leading-relaxed text-atlas-text">
                  {content ? <MarkdownContent content={content} /> : "…"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
