"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ToolEvent } from "../components/ToolEventCard";

export type MessageEntry = {
  id: string;
  type: "message";
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolEvents?: ToolEvent[];
};

export type ChatEntry = MessageEntry;

export type ConversationSummaryResponse = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ConversationMessageResponse = {
  kind: "message" | "tool";
  role: "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_status?: "start" | "complete" | "error";
  tool_call_id?: string | null;
  tool_input?: unknown;
  tool_output?: unknown;
};

export type ConversationDetailResponse = ConversationSummaryResponse & {
  messages: ConversationMessageResponse[];
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: ConversationMessageResponse[];
};

export type ServerEvent =
  | { type: "checkpoint"; checkpoint_id: string }
  | { type: "response_chunk"; text: string; checkpoint_id: string }
  | { type: "final_response"; text: string; checkpoint_id: string }
  | { type: "tool_call"; tool_name: string; input: unknown; checkpoint_id: string }
  | { type: "tool_result"; tool_name: string; output: unknown; checkpoint_id: string }
  | { type: "error"; message: string; checkpoint_id?: string }
  | { type: "done"; checkpoint_id: string };

const API_BASE =
  process.env.NEXT_PUBLIC_ASSISTANT_API ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

const uuid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

const coerceJson = (value: unknown) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const extractQuery = (input: unknown) => {
  if (typeof input === "string") {
    return input;
  }
  if (input && typeof input === "object" && "query" in input) {
    const maybeQuery = (input as { query?: unknown }).query;
    if (typeof maybeQuery === "string") {
      return maybeQuery;
    }
  }
  return undefined;
};

const shorten = (value: string, max = 72) => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
};

const normaliseDetail = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return `• ${item}`;
        }
        if (item && typeof item === "object") {
          const title = "title" in item && typeof (item as { title?: unknown }).title === "string" ? (item as { title: string }).title : "";
          const content = "content" in item && typeof (item as { content?: unknown }).content === "string" ? (item as { content: string }).content : "";
          return `• ${title || content}`;
        }
        return `• ${String(item)}`;
      })
      .join("\n");
  }
  try {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return undefined;
    }
    return entries.map(([key, val]) => `${key}: ${typeof val === "string" ? val : JSON.stringify(val)}`).join("\n");
  } catch {
    return String(value);
  }
};

const formatTavilyEvent = (event: ToolEvent, parsed: unknown): ToolEvent => {
  const outputObject =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const resultsArray = Array.isArray(parsed)
    ? (parsed as unknown[])
    : Array.isArray(outputObject.results)
      ? (outputObject.results as unknown[])
      : [];
  const queryFromInput = event.rawInput ? extractQuery(event.rawInput) : undefined;

  const next: ToolEvent = { ...event };

  if (queryFromInput) {
    next.headline = `Web search - "${queryFromInput}"`;
  } else if (!next.headline) {
    next.headline = "Web search";
  }

  if (typeof outputObject.response === "string" && outputObject.response.trim().length > 0) {
    next.detail = outputObject.response;
  } else if (resultsArray.length > 0) {
    // const first = resultsArray[0];
    // if (first && typeof first === "object") {
    //   const snippet =
    //     ("content" in (first as Record<string, unknown>) && typeof (first as { content?: unknown }).content === "string"
    //       ? ((first as { content: string }).content as string)
    //       : "") ||
    //     ("snippet" in (first as Record<string, unknown>) && typeof (first as { snippet?: unknown }).snippet === "string"
    //       ? ((first as { snippet: string }).snippet as string)
    //       : "") ||
    //     "";
    //   if (snippet) {
    //     next.detail = shorten(snippet, 160);
    //   }
    // }
    next.detail = undefined;
    next.links = resultsArray
      .map((item) => {
        if (item && typeof item === "object") {
          const maybeTitle = (item as { title?: unknown }).title;
          const maybeUrl = (item as { url?: unknown }).url;
          if (typeof maybeTitle === "string" && typeof maybeUrl === "string") {
            return { title: maybeTitle, url: maybeUrl };
          }
        }
        return undefined;
      })
      .filter((link): link is { title: string; url: string } => Boolean(link));

    if (!next.detail && next.links && next.links.length > 0) {
      next.detail = "Key sources surfaced from Tavily web search.";
    }
  }

  return next;
};

const createToolEvent = (toolName: string, rawInput: unknown, seedId?: string): ToolEvent => {
  const parsedInput = coerceJson(rawInput);
  const event: ToolEvent = {
    id: seedId ?? uuid(),
    toolName,
    status: "running",
    rawInput: parsedInput,
  };

  if (toolName === "tavily_search") {
    event.headline = "Preparing Tavily search…";
    const query = parsedInput ? extractQuery(parsedInput) : undefined;
    if (query) {
      event.detail = `Searching for ${query}`;
    }
  } else if (parsedInput && typeof parsedInput === "object") {
    const formattedDetail = normaliseDetail(parsedInput);
    if (formattedDetail) {
      event.detail = formattedDetail;
    }
  } else if (parsedInput) {
    event.detail = String(parsedInput);
  } else if (rawInput) {
    try {
      event.detail = JSON.stringify(rawInput, null, 2);
    } catch {
      event.detail = String(rawInput);
    }
  } else {
    event.headline = "Assistant tool engaged";
  }

  return event;
};

const completeToolEvent = (event: ToolEvent, toolName: string, rawOutput: unknown): ToolEvent => {
  const parsedOutput = coerceJson(rawOutput);
  let next: ToolEvent = {
    ...event,
    status: "completed",
    rawOutput: parsedOutput,
  };

  if (toolName === "tavily_search") {
    next = formatTavilyEvent(next, parsedOutput);
  } else {
    if (!next.headline || next.headline === "Assistant tool engaged") {
      next.headline = "Assistant tool completed";
    }
    const formattedDetail = normaliseDetail(parsedOutput);
    if (formattedDetail) {
      next.detail = formattedDetail;
    }
  }

  return next;
};

const ensureAssistantHost = (entries: MessageEntry[], conversationId: string, index: number) => {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].role === "assistant") {
      return i;
    }
  }
  const placeholder: MessageEntry = {
    id: `${conversationId}-assistant-${index}`,
    type: "message",
    role: "assistant",
    content: "",
    toolEvents: [],
    isStreaming: false,
  };
  entries.push(placeholder);
  return entries.length - 1;
};

const buildChatEntriesFromDetail = (
  conversationId: string,
  messages: ConversationMessageResponse[],
): MessageEntry[] => {
  const entries: MessageEntry[] = [];
  const pendingToolEvents: ToolEvent[] = [];

  messages.forEach((message, index) => {
    if (message.kind === "tool" || message.role === "tool") {
      const toolName = message.tool_name ?? "tool";
      const seedId = message.tool_call_id
        ? `${conversationId}-${message.tool_call_id}`
        : `${conversationId}-tool-${index}`;
      let event = createToolEvent(toolName, message.tool_input, seedId);

      if (message.tool_status === "complete" || message.tool_output !== undefined) {
        event = completeToolEvent(event, toolName, message.tool_output);
      }

      if (message.tool_status === "error") {
        event = {
          ...event,
          status: "error",
          detail: message.content || event.detail || "Tool execution failed.",
        };
      } else if (message.content && !event.detail) {
        event = {
          ...event,
          detail: message.content,
        };
      }

      pendingToolEvents.push(event);
      return;
    }

    if (message.role === "assistant" || message.role === "user") {
      if (message.role === "user" && pendingToolEvents.length > 0) {
        const hostIndex = ensureAssistantHost(entries, conversationId, index);
        const host = entries[hostIndex];
        const mergedEvents = host.toolEvents ? [...host.toolEvents, ...pendingToolEvents] : [...pendingToolEvents];
        entries[hostIndex] = {
          ...host,
          toolEvents: mergedEvents,
        };
        pendingToolEvents.length = 0;
      }

      const rawContent = message.content ?? "";
      const content = message.role === "user" ? rawContent : rawContent.trim();
      if (message.role === "assistant") {
        const pending = pendingToolEvents.splice(0, pendingToolEvents.length);
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && lastEntry.role === "assistant" && lastEntry.content.trim().length === 0) {
          const mergedEvents = lastEntry.toolEvents ? [...lastEntry.toolEvents, ...pending] : [...pending];
          entries[entries.length - 1] = {
            ...lastEntry,
            content,
            isStreaming: false,
            ...(mergedEvents.length > 0 ? { toolEvents: mergedEvents } : {}),
          };
          return;
        }
        const entry: MessageEntry = {
          id: `${conversationId}-${index}`,
          type: "message",
          role: message.role,
          content,
          isStreaming: false,
        };
        if (pending.length > 0) {
          entry.toolEvents = pending;
        }
        entries.push(entry);
        return;
      }

      const entry: MessageEntry = {
        id: `${conversationId}-${index}`,
        type: "message",
        role: message.role,
        content,
        isStreaming: false,
      };
      entries.push(entry);
    }
  });

  if (pendingToolEvents.length > 0) {
    const hostIndex = ensureAssistantHost(entries, conversationId, messages.length);
    const host = entries[hostIndex];
    const mergedEvents = host.toolEvents ? [...host.toolEvents, ...pendingToolEvents] : [...pendingToolEvents];
    entries[hostIndex] = {
      ...host,
      toolEvents: mergedEvents,
    };
  }

  return entries.filter(
    (entry) =>
      entry.role !== "assistant" ||
      entry.content.trim().length > 0 ||
      (entry.toolEvents && entry.toolEvents.length > 0),
  );
};

const toSummary = (payload: ConversationSummaryResponse): ConversationSummary => ({
  id: payload.id,
  title: payload.title,
  createdAt: payload.created_at,
  updatedAt: payload.updated_at,
});

const toDetail = (payload: ConversationDetailResponse): ConversationDetail => ({
  ...toSummary(payload),
  messages: payload.messages,
});

export const formatTimestamp = (iso: string) => {
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
};

export const useChatPage = () => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [emptyConversationIds, setEmptyConversationIds] = useState<Set<string>>(() => new Set());
  const feedRef = useRef<HTMLDivElement | null>(null);
  const isStreamingRef = useRef(false);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const listConversations = useCallback(async () => {
    const response = await fetch(`${API_BASE}/conversations`, {
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch conversations (${response.status})`);
    }
    const payload = (await response.json()) as ConversationSummaryResponse[];
    return payload.map(toSummary);
  }, []);

  const fetchConversationDetail = useCallback(async (conversationId: string) => {
    const response = await fetch(`${API_BASE}/conversations/${conversationId}`, {
      method: "GET",
    });
    if (response.status === 404) {
      throw new Error("Conversation not found");
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch conversation (${response.status})`);
    }
    const payload = (await response.json()) as ConversationDetailResponse;
    return toDetail(payload);
  }, []);

  const createConversationOnServer = useCallback(async () => {
    const response = await fetch(`${API_BASE}/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error(`Failed to create conversation (${response.status})`);
    }
    const payload = (await response.json()) as ConversationSummaryResponse;
    return toSummary(payload);
  }, []);

  const deleteConversationOnServer = useCallback(async (conversationId: string) => {
    const response = await fetch(`${API_BASE}/conversations/${conversationId}`, {
      method: "DELETE",
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete conversation (${response.status})`);
    }
  }, []);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      if (isStreamingRef.current) {
        return;
      }
      setIsLoadingConversation(true);
      try {
        const detail = await fetchConversationDetail(conversationId);
        setActiveConversationId(detail.id);
        const mapped = buildChatEntriesFromDetail(detail.id, detail.messages);
        setMessages(mapped);
        setEmptyConversationIds((prev) => {
          const isEmpty = mapped.length === 0;
          const hasId = prev.has(detail.id);
          if (isEmpty && hasId) {
            return prev;
          }
          if (!isEmpty && !hasId) {
            return prev;
          }
          const next = new Set(prev);
          if (isEmpty) {
            next.add(detail.id);
          } else {
            next.delete(detail.id);
          }
          return next;
        });
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoadingConversation(false);
      }
    },
    [fetchConversationDetail],
  );

  const selectConversation = useCallback(
    async (conversationId: string) => {
      await loadConversation(conversationId);
      setIsHistoryOpen(false);
    },
    [loadConversation],
  );

  const refreshConversations = useCallback(
    async (selectLatest = false) => {
      setIsLoadingConversations(true);
      try {
        const items = await listConversations();
        setConversations(items);
        setEmptyConversationIds((prev) => {
          if (prev.size === 0) {
            return prev;
          }
          const allowed = new Set(items.map((item) => item.id));
          let changed = false;
          const next = new Set<string>();
          prev.forEach((id) => {
            if (allowed.has(id)) {
              next.add(id);
            } else {
              changed = true;
            }
          });
          if (!changed && next.size === prev.size) {
            return prev;
          }
          return next;
        });
        if (selectLatest && items.length > 0) {
          await loadConversation(items[0].id);
          return;
        }
        let cleared = false;
        setActiveConversationId((prev) => {
          if (!prev) {
            return prev;
          }
          const stillExists = items.some((item) => item.id === prev);
          if (stillExists) {
            return prev;
          }
          cleared = true;
          return null;
        });
        if (cleared) {
          setMessages([]);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [listConversations, loadConversation],
  );

  useEffect(() => {
    void (async () => {
      await refreshConversations(true);
    })();
  }, [refreshConversations]);

  const ensureActiveConversation = useCallback(async () => {
    if (activeConversationId) {
      return activeConversationId;
    }
    const summary = await createConversationOnServer();
    setConversations((prev) => [summary, ...prev]);
    setActiveConversationId(summary.id);
    setEmptyConversationIds((prev) => {
      if (prev.has(summary.id)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(summary.id);
      return next;
    });
    return summary.id;
  }, [activeConversationId, createConversationOnServer]);

  const handleEvent = useCallback(
    (assistantMessageId: string, payload: ServerEvent) => {
      const upsertAssistant = (updater: (entry: MessageEntry | undefined) => MessageEntry | null) => {
        setMessages((prev) => {
          const index = prev.findIndex(
            (item) => item.type === "message" && item.id === assistantMessageId && item.role === "assistant",
          );
          const current = index >= 0 ? prev[index] : undefined;
          const nextEntry = updater(current);
          if (!nextEntry) {
            if (index === -1) {
              return prev;
            }
            const next = [...prev];
            next.splice(index, 1);
            return next;
          }
          if (index === -1) {
            return [...prev, nextEntry];
          }
          const next = [...prev];
          next[index] = nextEntry;
          return next;
        });
      };

      switch (payload.type) {
        case "checkpoint": {
          setActiveConversationId(payload.checkpoint_id);
          void refreshConversations();
          break;
        }
        case "response_chunk": {
          upsertAssistant((entry) => {
            const base =
              entry ??
              ({
                id: assistantMessageId,
                type: "message",
                role: "assistant",
                content: "",
                isStreaming: true,
                toolEvents: [],
              } satisfies MessageEntry);
            return {
              ...base,
              content: `${base.content}${payload.text}`,
              isStreaming: true,
            };
          });
          break;
        }
        case "final_response": {
          const finalText = payload.text ?? "";
          const trimmedFinal = finalText.trim();
          let shouldRefresh = false;
          upsertAssistant((entry) => {
            if (!entry) {
              if (!trimmedFinal) {
                return null;
              }
              shouldRefresh = true;
              return {
                id: assistantMessageId,
                type: "message",
                role: "assistant",
                content: finalText,
                isStreaming: false,
                toolEvents: [],
              };
            }
            const trimmedExisting = entry.content.trim();
            if (!trimmedFinal && !trimmedExisting) {
              return {
                ...entry,
                isStreaming: false,
              };
            }
            shouldRefresh = true;
            return {
              ...entry,
              content: trimmedFinal ? finalText : entry.content,
              isStreaming: false,
            };
          });
          setIsStreaming(false);
          if (shouldRefresh) {
            void refreshConversations();
          }
          break;
        }
        case "tool_call": {
          const toolInput = coerceJson(payload.input);
          const event = createToolEvent(payload.tool_name, toolInput);
          upsertAssistant((entry) => {
            const base =
              entry ??
              ({
                id: assistantMessageId,
                type: "message",
                role: "assistant",
                content: "",
                isStreaming: true,
                toolEvents: [],
              } satisfies MessageEntry);
            const toolEvents = base.toolEvents ? [...base.toolEvents, event] : [event];
            return {
              ...base,
              toolEvents,
            };
          });
          break;
        }
        case "tool_result": {
          upsertAssistant((entry) => {
            const base =
              entry ??
              ({
                id: assistantMessageId,
                type: "message",
                role: "assistant",
                content: "",
                isStreaming: true,
                toolEvents: [],
              } satisfies MessageEntry);
            const existingEvents = base.toolEvents ?? [];
            let matched = false;
            const nextEvents = existingEvents.map((event) => {
              if (!matched && event.toolName === payload.tool_name && event.status === "running") {
                matched = true;
                return completeToolEvent(event, payload.tool_name, payload.output);
              }
              return event;
            });
            if (!matched) {
              const fallbackStart = createToolEvent(payload.tool_name, undefined);
              const completedFallback = completeToolEvent(fallbackStart, payload.tool_name, payload.output);
              nextEvents.push(completedFallback);
            }
            return {
              ...base,
              toolEvents: nextEvents,
            };
          });
          void refreshConversations();
          break;
        }
        case "error": {
          const errorEvent: ToolEvent = {
            id: uuid(),
            toolName: "Agent",
            status: "error",
            detail: payload.message,
          };
          upsertAssistant((entry) => {
            const base =
              entry ??
              ({
                id: assistantMessageId,
                type: "message",
                role: "assistant",
                content: "",
                isStreaming: false,
                toolEvents: [],
              } satisfies MessageEntry);
            const toolEvents = base.toolEvents ? [...base.toolEvents, errorEvent] : [errorEvent];
            return {
              ...base,
              content: payload.message,
              isStreaming: false,
              toolEvents,
            };
          });
          setIsStreaming(false);
          break;
        }
        case "done": {
          upsertAssistant((entry) => {
            if (!entry) {
              return null;
            }
            const hasContent = entry.content.trim().length > 0;
            const hasTools = Boolean(entry.toolEvents && entry.toolEvents.length > 0);
            if (!hasContent && !hasTools) {
              return null;
            }
            if (!entry.isStreaming) {
              return entry;
            }
            return {
              ...entry,
              isStreaming: false,
            };
          });
          setIsStreaming(false);
          void refreshConversations();
          break;
        }
        default:
          break;
      }
    },
    [refreshConversations],
  );

  const streamResponse = useCallback(
    async (message: string, conversationId: string, assistantMessageId: string) => {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          checkpoint_id: conversationId,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            try {
              const payload = JSON.parse(line) as ServerEvent;
              handleEvent(assistantMessageId, payload);
              if (payload.type === "checkpoint") {
                setActiveConversationId(payload.checkpoint_id);
              }
            } catch (error) {
              console.error("Failed to parse event line", line, error);
            }
          }
          newlineIndex = buffer.indexOf("\n");
        }
      }

      const tail = buffer.trim();
      if (tail) {
        try {
          const payload = JSON.parse(tail) as ServerEvent;
          handleEvent(assistantMessageId, payload);
        } catch (error) {
          console.error("Failed to parse trailing payload", tail, error);
        }
      }
    },
    [handleEvent],
  );

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = input.trim();
      if (!value || isStreaming) {
        return;
      }

      const conversationId = await ensureActiveConversation();
      setEmptyConversationIds((prev) => {
        if (!prev.has(conversationId)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
      const userMessageId = uuid();
      const assistantMessageId = uuid();

      setMessages((prev) => [
        ...prev,
        { id: userMessageId, type: "message", role: "user", content: value },
        {
          id: assistantMessageId,
          type: "message",
          role: "assistant",
          content: "",
          isStreaming: true,
          toolEvents: [],
        },
      ]);

      setInput("");
      setIsStreaming(true);

      try {
        await streamResponse(value, conversationId, assistantMessageId);
      } catch (error: unknown) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Unexpected error";
        handleEvent(assistantMessageId, { type: "error", message });
      }
    },
    [ensureActiveConversation, handleEvent, input, isStreaming, streamResponse],
  );

  const startNewConversation = useCallback(async () => {
    if (isStreaming) {
      return;
    }

    if (activeConversationId && messages.length === 0) {
      setIsHistoryOpen(false);
      return;
    }

    let reusableId: string | null = null;
    for (const id of emptyConversationIds) {
      if (id === activeConversationId) {
        continue;
      }
      const exists = conversations.some((item) => item.id === id);
      if (exists) {
        reusableId = id;
        break;
      }
    }

    if (reusableId) {
      await loadConversation(reusableId);
      setIsHistoryOpen(false);
      return;
    }

    setIsLoadingConversation(true);
    try {
      const summary = await createConversationOnServer();
      setConversations((prev) => [summary, ...prev]);
      setActiveConversationId(summary.id);
      setMessages([]);
      setEmptyConversationIds((prev) => {
        if (prev.has(summary.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(summary.id);
        return next;
      });
      setIsHistoryOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingConversation(false);
    }
  }, [
    activeConversationId,
    conversations,
    createConversationOnServer,
    emptyConversationIds,
    isStreaming,
    loadConversation,
    messages,
  ]);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      if (isStreaming) {
        return;
      }
      const wasActive = conversationId === activeConversationId;
      setEmptyConversationIds((prev) => {
        if (!prev.has(conversationId)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
      try {
        await deleteConversationOnServer(conversationId);
        await refreshConversations();
        if (wasActive) {
          await startNewConversation();
        }
      } catch (error) {
        console.error(error);
      }
    },
    [activeConversationId, deleteConversationOnServer, isStreaming, refreshConversations, startNewConversation],
  );

  const disableInteractions = isStreaming || isLoadingConversation;

  const openHistory = useCallback(() => setIsHistoryOpen(true), []);
  const closeHistory = useCallback(() => setIsHistoryOpen(false), []);

  return {
    conversations,
    activeConversationId,
    messages,
    input,
    setInput,
    submit,
    isStreaming,
    isLoadingConversation,
    isLoadingConversations,
    isHistoryOpen,
    openHistory,
    closeHistory,
    startNewConversation,
    selectConversation,
    handleDeleteConversation,
    feedRef,
    disableInteractions,
  };
};
