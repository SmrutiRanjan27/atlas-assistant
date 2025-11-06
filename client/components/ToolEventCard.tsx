import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { ToolEvent } from "../types";
import { MarkdownContent } from "./MarkdownContent";


type ToolEventCardProps = {
  event: ToolEvent;
};


export function ToolEventCard({ event }: ToolEventCardProps) {
  const statusLabel = event.status === "completed" ? "Done" : event.status === "error" ? "Error" : "Running";
  const baseDetailMarkdownClass =
    "mt-2 text-sm leading-relaxed prose-p:!my-2 prose-li:marker:text-atlas-accent prose-code:text-[0.85rem]";
  const detailMarkdownClass = clsx(
    baseDetailMarkdownClass,
    event.status === "error"
      ? "prose-p:!text-atlas-danger prose-strong:!text-atlas-danger"
      : "prose-p:!text-atlas-text-secondary prose-strong:!text-atlas-accent-strong",
  );
  const hasDetailSections = Boolean(event.detailSections && event.detailSections.length > 0);
  const [isCollapsed, setIsCollapsed] = useState(() => event.status === "completed");
  const previousStatusRef = useRef(event.status);
  useEffect(() => {
    if (previousStatusRef.current === "running" && event.status === "completed") {
      setIsCollapsed(true);
    }
    previousStatusRef.current = event.status;
  }, [event.status]);
  const handleToggle = () => {
    setIsCollapsed((value) => !value);
  };
  const showBody = !isCollapsed;


  return (
    <div className="rounded-2xl border border-[rgba(124,108,255,0.25)] bg-[rgba(12,18,36,0.68)] px-4 py-4 text-atlas-text shadow-[0_12px_30px_rgba(8,12,28,0.25)]">
      <div className="flex items-start justify-between gap-3 text-[0.7rem] uppercase tracking-[0.28em] text-atlas-text-secondary sm:items-center">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span>Tool Invocation</span>
          {event.toolName && <span className="text-[0.6rem] tracking-[0.24em] text-atlas-text-tertiary">{event.toolName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[0.6rem] font-semibold tracking-[0.22em]",
              event.status === "completed"
                ? "bg-[rgba(42,229,185,0.12)] text-atlas-success"
                : event.status === "error"
                  ? "bg-[rgba(255,92,128,0.12)] text-atlas-danger"
                  : "bg-[rgba(124,108,255,0.12)] text-atlas-accent-strong",
            )}
          >
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={handleToggle}
            className="rounded-full border border-[rgba(124,108,255,0.35)] px-3 py-1 text-[0.55rem] font-semibold tracking-[0.22em] text-atlas-text-secondary transition hover:border-[rgba(124,108,255,0.6)] hover:text-atlas-accent-strong"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand tool details" : "Collapse tool details"}
          >
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      <div className="mt-2 text-base font-semibold text-atlas-text">
        {event.headline ?? "Assistant tool update"}
      </div>
      {showBody && (
        <>
          {hasDetailSections && (
            <div className="mt-3 space-y-3">
              {event.detailSections!.map((section, index) => (
                <div
                  key={`${event.id}-section-${index}`}
                  className="rounded-2xl border border-[rgba(124,108,255,0.32)] bg-gradient-to-br from-[rgba(18,26,56,0.85)] via-[rgba(12,18,40,0.85)] to-[rgba(28,36,78,0.65)] px-4 py-3 shadow-[0_10px_25px_rgba(6,10,26,0.35)] backdrop-blur-lg"
                >
                  {section.title && (
                    <div className="text-[0.7rem] uppercase tracking-[0.22em] text-atlas-text-tertiary">
                      {section.title}
                    </div>
                  )}
                  {section.lines.length > 0 && (
                    <MarkdownContent
                      content={section.lines.join("\n\n")}
                      className="mt-2 text-sm leading-relaxed prose-p:!my-2 prose-p:!text-atlas-text-secondary prose-strong:!text-atlas-accent-strong prose-li:marker:text-atlas-accent"
                    />
                  )}
                  {section.footnote && (
                    <div className="mt-3 rounded-xl border border-[rgba(124,108,255,0.25)] bg-[rgba(10,16,34,0.75)] px-3 py-2">
                      <MarkdownContent
                        content={section.footnote}
                        className="text-xs prose-p:!my-1 prose-p:!text-atlas-text-tertiary"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!hasDetailSections && event.detail && (
            <MarkdownContent content={event.detail} className={detailMarkdownClass} />
          )}
          {event.links && event.links.length > 0 && (
            <ul className="mt-3 space-y-2">
              {event.links.map((link) => (
                <li key={`${event.id}-${link.url}`}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block rounded-xl border border-[rgba(124,108,255,0.25)] bg-[rgba(8,12,28,0.65)] px-4 py-4 transition hover:border-[rgba(124,108,255,0.55)] hover:bg-[rgba(18,24,52,0.9)]"
                  >
                    <span className="text-sm font-semibold text-atlas-success transition group-hover:text-atlas-accent-strong">
                      {link.title}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {event.status === "running" && !event.links && (
            <div className="mt-3 rounded-xl border border-dashed border-[rgba(124,108,255,0.25)] bg-[rgba(7,11,28,0.45)] px-4 py-3 text-xs text-atlas-text-secondary">
              Gathering context...
            </div>
          )}
          {event.status === "error" && !event.detail && !hasDetailSections && (
            <div className="mt-3 rounded-xl border border-[rgba(255,92,128,0.35)] bg-[rgba(44,9,24,0.45)] px-4 py-3 text-sm text-atlas-danger">
              Tool execution failed.
            </div>
          )}
        </>
      )}
    </div>
  );
}