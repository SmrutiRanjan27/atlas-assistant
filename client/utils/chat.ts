/**
 * Utility functions for chat functionality
 */

import type { ConversationMessageResponse, MessageEntry, ToolEvent } from '../types';

/**
 * Generate a simple UUID-like string
 */
export const generateId = (): string =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

/**
 * Coerce a value to JSON, attempting to parse strings
 */
export const coerceJson = (value: unknown): unknown => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

/**
 * Extract query from tool input object
 */
export const extractQuery = (input: unknown): string | undefined => {
  if (typeof input === 'string') {
    return input;
  }
  if (input && typeof input === 'object' && 'query' in input) {
    const maybeQuery = (input as { query?: unknown }).query;
    if (typeof maybeQuery === 'string') {
      return maybeQuery;
    }
  }
  return undefined;
};

/**
 * Shorten a string to a maximum length
 */
export const shorten = (value: string, max = 72): string => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
};

/**
 * Normalize various data types to a formatted string
 */
export const normaliseDetail = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return `• ${item}`;
        }
        if (item && typeof item === 'object') {
          const title = 'title' in item && typeof (item as { title?: unknown }).title === 'string' 
            ? (item as { title: string }).title : '';
          const content = 'content' in item && typeof (item as { content?: unknown }).content === 'string' 
            ? (item as { content: string }).content : '';
          return `• ${title || content}`;
        }
        return `• ${String(item)}`;
      })
      .join('\n');
  }
  try {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return undefined;
    }
    return entries.map(([key, val]) => 
      `${key}: ${typeof val === 'string' ? val : JSON.stringify(val)}`
    ).join('\n');
  } catch {
    return String(value);
  }
};

/**
 * Format timestamp from ISO string to readable format
 */
export const formatTimestamp = (iso: string): string => {
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return iso;
  }
};

/**
 * Ensure there's an assistant message entry to host tool events
 */
export const ensureAssistantHost = (
  entries: MessageEntry[], 
  conversationId: string, 
  index: number
): number => {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].role === 'assistant') {
      return i;
    }
  }
  const placeholder: MessageEntry = {
    id: `${conversationId}-assistant-${index}`,
    type: 'message',
    role: 'assistant',
    content: '',
    toolEvents: [],
    isStreaming: false,
  };
  entries.push(placeholder);
  return entries.length - 1;
};

/**
 * Build chat entries from conversation detail messages
 */
export const buildChatEntriesFromDetail = (
  conversationId: string,
  messages: ConversationMessageResponse[],
): MessageEntry[] => {
  const entries: MessageEntry[] = [];
  const pendingToolEvents: ToolEvent[] = [];

  messages.forEach((message, index) => {
    if (message.kind === 'tool' || message.role === 'tool') {
      const toolName = message.tool_name ?? 'tool';
      const seedId = message.tool_call_id
        ? `${conversationId}-${message.tool_call_id}`
        : `${conversationId}-tool-${index}`;
      let event = createToolEvent(toolName, message.tool_input, seedId);

      if (message.tool_status === 'complete' || message.tool_output !== undefined) {
        event = completeToolEvent(event, toolName, message.tool_output);
      }

      if (message.tool_status === 'error') {
        event = {
          ...event,
          status: 'error',
          detail: message.content || event.detail || 'Tool execution failed.',
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

    if (message.role === 'assistant' || message.role === 'user') {
      if (message.role === 'user' && pendingToolEvents.length > 0) {
        const hostIndex = ensureAssistantHost(entries, conversationId, index);
        const host = entries[hostIndex];
        const mergedEvents = host.toolEvents ? [...host.toolEvents, ...pendingToolEvents] : [...pendingToolEvents];
        entries[hostIndex] = {
          ...host,
          toolEvents: mergedEvents,
        };
        pendingToolEvents.length = 0;
      }

      const rawContent = message.content ?? '';
      const content = message.role === 'user' ? rawContent : rawContent.trim();
      if (message.role === 'assistant') {
        const pending = pendingToolEvents.splice(0, pendingToolEvents.length);
        const lastEntry = entries[entries.length - 1];
        if (lastEntry && lastEntry.role === 'assistant' && lastEntry.content.trim().length === 0) {
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
          type: 'message',
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
        type: 'message',
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
      entry.role !== 'assistant' ||
      entry.content.trim().length > 0 ||
      (entry.toolEvents && entry.toolEvents.length > 0),
  );
};

/**
 * Create a tool event from tool name and input
 */
export const createToolEvent = (toolName: string, rawInput: unknown, seedId?: string): ToolEvent => {
  const parsedInput = coerceJson(rawInput);
  const event: ToolEvent = {
    id: seedId ?? generateId(),
    toolName,
    status: 'running',
    rawInput: parsedInput,
  };

  if (toolName === 'tavily_search') {
    event.headline = 'Preparing Tavily search…';
    const query = parsedInput ? extractQuery(parsedInput) : undefined;
    if (query) {
      event.detail = `Searching for ${query}`;
    }
  } else if (parsedInput && typeof parsedInput === 'object') {
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
    event.headline = 'Assistant tool engaged';
  }

  return event;
};

/**
 * Complete a tool event with output data
 */
export const completeToolEvent = (event: ToolEvent, toolName: string, rawOutput: unknown): ToolEvent => {
  const parsedOutput = coerceJson(rawOutput);
  let next: ToolEvent = {
    ...event,
    status: 'completed',
    rawOutput: parsedOutput,
  };

  if (toolName === 'tavily_search') {
    next = formatTavilyEvent(next, parsedOutput);
  } else {
    if (!next.headline || next.headline === 'Assistant tool engaged') {
      next.headline = 'Assistant tool completed';
    }
    const formattedDetail = normaliseDetail(parsedOutput);
    if (formattedDetail) {
      next.detail = formattedDetail;
    }
  }

  return next;
};

/**
 * Format Tavily search tool event with results
 */
export const formatTavilyEvent = (event: ToolEvent, parsed: unknown): ToolEvent => {
  const outputObject =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
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
    next.headline = 'Web search';
  }

  if (typeof outputObject.response === 'string' && outputObject.response.trim().length > 0) {
    next.detail = outputObject.response;
  } else if (resultsArray.length > 0) {
    next.detail = undefined;
    next.links = resultsArray
      .map((item) => {
        if (item && typeof item === 'object') {
          const maybeTitle = (item as { title?: unknown }).title;
          const maybeUrl = (item as { url?: unknown }).url;
          if (typeof maybeTitle === 'string' && typeof maybeUrl === 'string') {
            return { title: maybeTitle, url: maybeUrl };
          }
        }
        return undefined;
      })
      .filter((link): link is { title: string; url: string } => Boolean(link));

    if (!next.detail && next.links && next.links.length > 0) {
      next.detail = 'Key sources surfaced from Tavily web search.';
    }
  }

  return next;
};