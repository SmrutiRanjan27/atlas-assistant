/**
 * Utility functions for chat functionality
 */


import type {
  ConversationMessageResponse,
  MessageEntry,
  ToolEvent,
  ToolEventDetailSection,
} from '../types';


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
          return `- ${item}`;
        }
        if (item && typeof item === 'object') {
          const title = 'title' in item && typeof (item as { title?: unknown }).title === 'string'
            ? (item as { title: string }).title : '';
          const content = 'content' in item && typeof (item as { content?: unknown }).content === 'string'
            ? (item as { content: string }).content : '';
          return `- ${title || content}`;
        }
        return `- ${String(item)}`;
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
  let detailFromInput: string | undefined;


  if (toolName === 'tavily_search') {
    event.headline = 'Preparing Tavily search...';
    const query = parsedInput ? extractQuery(parsedInput) : undefined;
    if (query) {
      detailFromInput = `Searching for ${query}`;
    }
  } else if (toolName === 'document_retriever') {
    event.headline = 'Searching internal documents...';
    const query = parsedInput ? extractQuery(parsedInput) : undefined;
    if (query) {
      detailFromInput = `Looking for "${query}" in the knowledge base`;
    } else {
      detailFromInput = 'Reviewing internal docs for relevant excerpts.';
    }
  } else if (toolName === 'memory_retriever') {
    event.headline = 'Consulting conversation memory...';
    const query = parsedInput ? extractQuery(parsedInput) : undefined;
    if (query) {
      detailFromInput = `Retrieving memories related to "${query}".`;
    } else {
      detailFromInput = 'Searching stored conversations for useful context.';
    }
  } else if (toolName === 'excel_search_tool') {
    event.headline = 'Analyzing workforce dataset...';
    if (parsedInput && typeof parsedInput === 'object' && 'query' in parsedInput) {
      const maybeQuery = (parsedInput as Record<string, unknown>).query;
      if (typeof maybeQuery === 'string' && maybeQuery.trim().length > 0) {
        detailFromInput = shorten(maybeQuery.trim(), 120);
      }
    }
  } else if (toolName === 'location_weather_tool') {
    event.headline = 'Checking local conditions...';
    if (parsedInput && typeof parsedInput === 'object' && parsedInput !== null) {
      const maybeIp = (parsedInput as Record<string, unknown>).ip;
      if (typeof maybeIp === 'string' && maybeIp.trim().length > 0) {
        detailFromInput = `Looking up weather details for IP ${maybeIp.trim()}.`;
      }
    }
    if (!detailFromInput) {
      detailFromInput = 'Determining your current location and weather forecast.';
    }
  }


  if (!detailFromInput) {
    if (parsedInput && typeof parsedInput === 'object') {
      const formattedDetail = normaliseDetail(parsedInput);
      if (formattedDetail) {
        detailFromInput = formattedDetail;
      }
    } else if (parsedInput) {
      detailFromInput = String(parsedInput);
    } else if (rawInput) {
      try {
        detailFromInput = JSON.stringify(rawInput, null, 2);
      } catch {
        detailFromInput = String(rawInput);
      }
    } else {
      event.headline = event.headline ?? 'Assistant tool engaged';
    }
  }


  if (detailFromInput) {
    event.detail = detailFromInput;
  }


  if (!event.headline) {
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
    detailSections: undefined,
  };


  if (toolName === 'tavily_search') {
    next = formatTavilyEvent(next, parsedOutput);
  } else if (toolName === 'document_retriever') {
    next = formatDocumentEvent(next, parsedOutput);
  } else if (toolName === 'memory_retriever') {
    next = formatMemoryEvent(next, parsedOutput);
  } else if (toolName === 'excel_search_tool') {
    next = formatExcelEvent(next, parsedOutput);
  } else if (toolName === 'location_weather_tool') {
    next = formatLocationWeatherEvent(next, parsedOutput);
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


const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);


const sectionsToDetail = (sections: ToolEventDetailSection[]): string => {
  return sections
    .map((section) => {
      const title = section.title ? `${section.title}\n` : '';
      const body = section.lines.map((line) => `- ${line}`).join('\n');
      const footnote = section.footnote ? `\n${section.footnote}` : '';
      return `${title}${body}${footnote}`.trim();
    })
    .filter((entry) => entry.length > 0)
    .join('\n\n');
};


type ExcelTable = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  summary?: string;
  rowCount?: number;
};


const normaliseMessageText = (content: unknown): string | undefined => {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }


  if (Array.isArray(content)) {
    const collected = content
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (isRecord(entry)) {
          if (typeof entry.text === 'string') {
            return entry.text.trim();
          }
          if (typeof entry.content === 'string') {
            return entry.content.trim();
          }
          if (typeof entry.data === 'string') {
            return entry.data.trim();
          }
        }
        return undefined;
      })
      .filter((value): value is string => Boolean(value && value.length > 0));
    if (collected.length > 0) {
      return collected.join(' ').trim();
    }
    return undefined;
  }


  if (isRecord(content)) {
    if (typeof content.text === 'string' && content.text.trim().length > 0) {
      return content.text.trim();
    }
    if (typeof content.content === 'string' && content.content.trim().length > 0) {
      return content.content.trim();
    }
    if (typeof content.message === 'string' && content.message.trim().length > 0) {
      return content.message.trim();
    }
  }


  return undefined;
};


const normaliseExcelRow = (row: unknown, columns: string[]): Record<string, unknown> => {
  if (isRecord(row)) {
    return row;
  }
  if (Array.isArray(row)) {
    const mapped: Record<string, unknown> = {};
    row.forEach((value, index) => {
      const key = columns[index] ?? `col_${index + 1}`;
      mapped[key] = value;
    });
    return mapped;
  }
  return { value: row };
};


const tryCreateExcelTableFromRecord = (record: Record<string, unknown>): ExcelTable | null => {
  const columnsCandidate = record.columns;
  const rowsCandidate = record.rows;


  if (
    Array.isArray(columnsCandidate) &&
    columnsCandidate.every((col) => typeof col === 'string') &&
    Array.isArray(rowsCandidate)
  ) {
    const columns = columnsCandidate as string[];
    const rows = (rowsCandidate as unknown[]).map((row) => normaliseExcelRow(row, columns));
    const summary =
      typeof record.summary === 'string' && record.summary.trim().length > 0
        ? record.summary.trim()
        : undefined;
    const rowCount =
      typeof record.row_count === 'number'
        ? record.row_count
        : typeof record.rowCount === 'number'
          ? record.rowCount
          : rows.length;
    return {
      columns,
      rows,
      summary,
      rowCount,
    };
  }


  if (isRecord(record.data)) {
    const nested = tryCreateExcelTableFromRecord(record.data);
    if (nested) {
      return nested;
    }
  }


  if (Array.isArray(record.content)) {
    for (const entry of record.content) {
      const parsed = coerceJson(entry);
      if (isRecord(parsed)) {
        const nested = tryCreateExcelTableFromRecord(parsed);
        if (nested) {
          return nested;
        }
      }
    }
  } else if (typeof record.content === 'string') {
    const parsed = coerceJson(record.content);
    if (isRecord(parsed)) {
      const nested = tryCreateExcelTableFromRecord(parsed);
      if (nested) {
        return nested;
      }
    }
  }


  return null;
};


const collectExcelTables = (root: unknown): ExcelTable[] => {
  const tables: ExcelTable[] = [];
  const seenTables = new Set<string>();
  const objectSet = new WeakSet<object>();
  const queue: unknown[] = [root];


  const registerTable = (table: ExcelTable) => {
    const digest = JSON.stringify({ columns: table.columns, rows: table.rows.slice(0, 3) });
    if (!seenTables.has(digest)) {
      seenTables.add(digest);
      tables.push(table);
    }
  };


  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null) {
      continue;
    }


    if (typeof current === 'string') {
      const parsed = coerceJson(current);
      if (parsed !== current) {
        queue.push(parsed);
      }
      continue;
    }


    if (typeof current !== 'object') {
      continue;
    }


    if (Array.isArray(current)) {
      if (objectSet.has(current)) {
        continue;
      }
      objectSet.add(current);
      for (const entry of current) {
        queue.push(entry);
      }
      continue;
    }


    const record = current as Record<string, unknown>;
    if (objectSet.has(record)) {
      continue;
    }
    objectSet.add(record);


    const table = tryCreateExcelTableFromRecord(record);
    if (table) {
      registerTable(table);
    }


    const nestedCandidates: unknown[] = [
      record.content,
      record.output,
      record.outputs,
      record.result,
      record.results,
      record.data,
      record.value,
      record.response,
      record.payload,
      record.tool_output,
      record.table,
      record.table_data,
    ];


    for (const candidate of nestedCandidates) {
      if (candidate !== undefined) {
        queue.push(candidate);
      }
    }


    if (Array.isArray(record.messages)) {
      queue.push(record.messages);
    }
    if (Array.isArray(record.tool_calls)) {
      queue.push(record.tool_calls);
    }
    if (Array.isArray(record.arguments)) {
      queue.push(record.arguments);
    }
  }


  return tables;
};


const collectExcelAnalyses = (root: unknown): string[] => {
  const analyses: string[] = [];
  const objectSet = new WeakSet<object>();


  const enqueue = (value: unknown): void => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      const parsed = coerceJson(value);
      if (parsed !== value) {
        enqueue(parsed);
      }
      return;
    }
    if (typeof value !== 'object') {
      return;
    }
    if (Array.isArray(value)) {
      if (objectSet.has(value)) {
        return;
      }
      objectSet.add(value);
      value.forEach(enqueue);
      return;
    }
    const record = value as Record<string, unknown>;
    if (objectSet.has(record)) {
      return;
    }
    objectSet.add(record);


    const role = typeof record.type === 'string' ? record.type : typeof record.role === 'string' ? record.role : undefined;
    const loweredRole = role ? role.toLowerCase() : undefined;
    if (loweredRole === 'ai' || loweredRole === 'assistant') {
      const text = normaliseMessageText(record.content);
      if (text) {
        analyses.push(text);
      }
    }


    if (Array.isArray(record.messages)) {
      record.messages.forEach(enqueue);
    }
    if (Array.isArray(record.tool_calls)) {
      record.tool_calls.forEach(enqueue);
    }
    if (record.content !== undefined) {
      enqueue(record.content);
    }
    if (record.output !== undefined) {
      enqueue(record.output);
    }
    if (record.result !== undefined) {
      enqueue(record.result);
    }
  };


  enqueue(root);
  return analyses;
};


const parseQuotedString = (text: string, startIndex: number): { value: string; endIndex: number } | null => {
  const quote = text[startIndex];
  if (quote !== "'" && quote !== '"') {
    return null;
  }
  let i = startIndex + 1;
  let result = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) {
        break;
      }
      if (next === 'n') {
        result += '\n';
      } else if (next === 't') {
        result += '\t';
      } else if (next === 'r') {
        result += '\r';
      } else {
        result += next;
      }
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { value: result, endIndex: i + 1 };
    }
    result += ch;
    i += 1;
  }
  return null;
};


const parseExcelSearchOutputString = (value: string): { tables: ExcelTable[]; analyses: string[]; query?: string } => {
  const tables: ExcelTable[] = [];
  const analyses: string[] = [];
  let query: string | undefined;


  const queryMatch = value.match(/'query':\s*'([^']+)'/);
  if (queryMatch && queryMatch[1]) {
    query = queryMatch[1].replace(/\\n/g, '\n').trim();
  }


  let index = 0;
  while (index < value.length) {
    const toolIdx = value.indexOf('ToolMessage(content=', index);
    if (toolIdx === -1) {
      break;
    }
    let cursor = toolIdx + 'ToolMessage(content='.length;
    while (cursor < value.length && value[cursor] === ' ') {
      cursor += 1;
    }
    const quoted = parseQuotedString(value, cursor);
    if (!quoted) {
      index = cursor + 1;
      continue;
    }
    index = quoted.endIndex;
    const decoded = quoted.value;
    const parsedPayload = coerceJson(decoded);
    if (isRecord(parsedPayload)) {
      const table = tryCreateExcelTableFromRecord(parsedPayload);
      if (table) {
        tables.push(table);
      }
    }
  }


  index = 0;
  while (index < value.length) {
    const aiIdx = value.indexOf('AIMessage(content=', index);
    if (aiIdx === -1) {
      break;
    }
    let cursor = aiIdx + 'AIMessage(content='.length;
    while (cursor < value.length && value[cursor] === ' ') {
      cursor += 1;
    }
    const quoted = parseQuotedString(value, cursor);
    if (!quoted) {
      index = cursor + 1;
      continue;
    }
    index = quoted.endIndex;
    const content = quoted.value.trim();
    if (content.length > 0) {
      analyses.push(content);
    }
  }


  return { tables, analyses, query };
};


const formatScore = (score: number | undefined): string | undefined => {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return undefined;
  }
  const percent = Math.round(Math.max(0, Math.min(1, score)) * 100);
  return `Relevance: ${percent}%`;
};


const formatTimestampDetail = (value: unknown): string | undefined => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return undefined;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  const millis = numeric > 1e11 ? numeric : numeric * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};


export const formatDocumentEvent = (event: ToolEvent, parsed: unknown): ToolEvent => {
  const outputObject = isRecord(parsed) ? parsed : {};
  const resultsArray = Array.isArray(outputObject.results)
    ? (outputObject.results as unknown[])
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : [];
  const message = typeof outputObject.message === 'string' ? outputObject.message : undefined;


  const next: ToolEvent = {
    ...event,
    headline: event.headline ?? 'Document retrieval complete',
  };


  const sections: ToolEventDetailSection[] = [];
  let processed = 0;


  resultsArray.slice(0, 3).forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    processed += 1;


    const record = item as Record<string, unknown>;
    const sourceRaw = typeof record.source === 'string' ? record.source : undefined;
    const source = sourceRaw && sourceRaw.trim().length > 0 ? sourceRaw.trim() : `Document ${index + 1}`;
    const chunkIndex = typeof record.chunk_index === 'number' ? record.chunk_index : undefined;
    const title = chunkIndex !== undefined ? `${index + 1}. ${source} (chunk ${chunkIndex})` : `${index + 1}. ${source}`;


    let snippet = typeof record.snippet === 'string' ? record.snippet : undefined;
    snippet = snippet && snippet.trim().length > 0 ? snippet.trim() : undefined;
    if (!snippet) {
      const fullText = typeof record.full_text === 'string' ? record.full_text : undefined;
      if (fullText && fullText.trim().length > 0) {
        snippet = shorten(fullText.trim(), 320);
      }
    }


    const lines: string[] = [];
    lines.push(snippet && snippet.length > 0 ? snippet : 'No preview text available.');
    const score = formatScore(record.score as number | undefined);
    if (score) {
      lines.push(score);
    }


    sections.push({
      title,
      lines,
    });
  });


  if (!sections.length) {
    const fallback = message ?? 'No relevant documents were found.';
    next.detail = fallback;
    next.detailSections = message ? [{ lines: [message] }] : undefined;
    return next;
  }


  const remaining = resultsArray.length - processed;
  if (remaining > 0) {
    sections.push({
      lines: [`... ${remaining} additional result${remaining === 1 ? '' : 's'} not shown.`],
    });
  }
  if (message) {
    sections.push({
      lines: [message],
    });
  }


  next.detailSections = sections;
  next.detail = sectionsToDetail(sections);
  return next;
};


export const formatMemoryEvent = (event: ToolEvent, parsed: unknown): ToolEvent => {
  const outputObject = isRecord(parsed) ? parsed : {};
  const resultsArray = Array.isArray(outputObject.results)
    ? (outputObject.results as unknown[])
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : [];
  const message = typeof outputObject.message === 'string' ? outputObject.message : undefined;


  const next: ToolEvent = {
    ...event,
    headline: event.headline ?? 'Memory recall complete',
  };


  if (!resultsArray.length) {
    const fallback = message ?? 'No prior memories matched this query.';
    next.detail = fallback;
    next.detailSections = message ? [{ lines: [message] }] : undefined;
    return next;
  }


  const sections: ToolEventDetailSection[] = [];
  let processed = 0;


  resultsArray.slice(0, 3).forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    processed += 1;


    const record = item as Record<string, unknown>;
    const userText = typeof record.user === 'string' && record.user.trim().length > 0 ? record.user.trim() : undefined;
    const assistantText =
      typeof record.assistant === 'string' && record.assistant.trim().length > 0 ? record.assistant.trim() : undefined;
    const summary = typeof record.summary === 'string' && record.summary.trim().length > 0 ? record.summary.trim() : undefined;


    const lines: string[] = [];
    if (userText) {
      lines.push(`You: ${shorten(userText, 200)}`);
    }
    if (assistantText) {
      lines.push(`Atlas: ${shorten(assistantText, 200)}`);
    }
    if (!lines.length && summary) {
      lines.push(shorten(summary, 220));
    }
    if (!lines.length) {
      lines.push('No transcript available.');
    }


    const timestamp = formatTimestampDetail(record.timestamp);
    const score = formatScore(record.score as number | undefined);
    const metadataParts = [timestamp, score].filter((part): part is string => Boolean(part && part.length > 0));
    const title = metadataParts.length > 0 ? `Match ${index + 1} | ${metadataParts.join(' | ')}` : `Match ${index + 1}`;


    sections.push({
      title,
      lines,
    });
  });


  const remaining = resultsArray.length - processed;
  if (remaining > 0) {
    sections.push({
      lines: [`... ${remaining} additional memory match${remaining === 1 ? '' : 'es'} not shown.`],
    });
  }
  if (message) {
    sections.push({
      lines: [message],
    });
  }


  next.detailSections = sections;
  next.detail = sectionsToDetail(sections);
  return next;
};


const formatLocalDateTime = (isoString: string, timezone?: string): string => {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }
    const formatted = date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return timezone ? `${formatted} (${timezone})` : formatted;
  } catch {
    return isoString;
  }
};


const toTitleCase = (value: string): string =>
  value
    .split(' ')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : ''))
    .join(' ');


export const formatLocationWeatherEvent = (event: ToolEvent, parsed: unknown): ToolEvent => {
  const next: ToolEvent = {
    ...event,
    headline: event.headline ?? 'Local conditions retrieved',
  };


  if (!isRecord(parsed)) {
    const fallback = normaliseDetail(parsed);
    if (fallback) {
      next.detail = fallback;
    }
    return next;
  }


  const city = typeof parsed.city === 'string' && parsed.city.trim().length > 0 ? parsed.city.trim() : undefined;
  const region = typeof parsed.region === 'string' && parsed.region.trim().length > 0 ? parsed.region.trim() : undefined;
  const country =
    typeof parsed.country === 'string' && parsed.country.trim().length > 0 ? parsed.country.trim() : undefined;
  const timezone =
    typeof parsed.timezone === 'string' && parsed.timezone.trim().length > 0 ? parsed.timezone.trim() : undefined;
  const localTime =
    typeof parsed.local_time === 'string' && parsed.local_time.trim().length > 0 ? parsed.local_time.trim() : undefined;
  const ip = typeof parsed.ip === 'string' && parsed.ip.trim().length > 0 ? parsed.ip.trim() : undefined;


  const weather =
    isRecord(parsed.weather) && !Array.isArray(parsed.weather) ? (parsed.weather as Record<string, unknown>) : undefined;
  const temp = weather && typeof weather.temp === 'number' ? weather.temp : undefined;
  const humidity = weather && typeof weather.humidity === 'number' ? Math.round(weather.humidity) : undefined;
  const description =
    weather && typeof weather.description === 'string' && weather.description.trim().length > 0
      ? toTitleCase(weather.description.trim())
      : undefined;


  const sections: ToolEventDetailSection[] = [];
  const locationLines: string[] = [];


  const locationParts = [city, region, country].filter(Boolean).join(', ');
  if (locationParts) {
    locationLines.push(locationParts);
  }
  if (timezone) {
    locationLines.push(`Timezone: ${timezone}`);
  }
  if (localTime) {
    locationLines.push(`Local time: ${formatLocalDateTime(localTime, timezone)}`);
  }
  if (ip) {
    locationLines.push(`IP: ${ip}`);
  }


  if (locationLines.length > 0) {
    sections.push({
      title: 'Location',
      lines: locationLines,
    });
  }


  const weatherLines: string[] = [];
  if (typeof temp === 'number') {
    const rounded = Math.round(temp * 10) / 10;
    weatherLines.push(`Temperature: ${rounded.toFixed(1)}°C`);
  }
  if (description) {
    weatherLines.push(`Conditions: ${description}`);
  }
  if (typeof humidity === 'number' && !Number.isNaN(humidity)) {
    weatherLines.push(`Humidity: ${humidity}%`);
  }


  if (weatherLines.length > 0) {
    sections.push({
      title: 'Weather',
      lines: weatherLines,
    });
  }


  if (!sections.length) {
    const fallback = normaliseDetail(parsed);
    if (fallback) {
      next.detail = fallback;
    }
    return next;
  }


  if (city || region || country) {
    const headlineParts = city
      ? [city, country ?? region].filter(Boolean)
      : region
        ? [region, country].filter(Boolean)
        : country
          ? [country]
          : [];
    if (headlineParts.length > 0) {
      next.headline = `Local conditions for ${headlineParts.join(', ')}`;
    }
  }


  next.detailSections = sections;
  next.detail = sectionsToDetail(sections);
  return next;
};


export const formatExcelEvent = (event: ToolEvent, parsed: unknown): ToolEvent => {
  const next: ToolEvent = {
    ...event,
    headline: event.headline ?? 'Excel analysis complete',
  };


  let tables = collectExcelTables(parsed);
  let analyses = collectExcelAnalyses(parsed);
  let queryLine: string | undefined;


  if (typeof parsed === 'string') {
    const extracted = parseExcelSearchOutputString(parsed);
    if (tables.length === 0 && extracted.tables.length > 0) {
      tables = extracted.tables;
    }
    if (analyses.length === 0 && extracted.analyses.length > 0) {
      analyses = extracted.analyses;
    }
    if (extracted.query) {
      queryLine = `Query: ${shorten(extracted.query, 160)}`;
    }
  }
  const sections: ToolEventDetailSection[] = [];


  if (tables.length > 0) {
    const primary = tables[0];
    const summaryLines: string[] = [];


    if (queryLine) {
      summaryLines.push(queryLine);
    }
    if (primary.summary) {
      summaryLines.push(primary.summary);
    }
    if (typeof primary.rowCount === 'number') {
      summaryLines.push(`Rows matched: ${primary.rowCount}`);
    }


    const finalAnalysis = analyses.length > 0 ? analyses[analyses.length - 1] : undefined;
    if (finalAnalysis) {
      summaryLines.push(shorten(finalAnalysis, 320));
    }


    if (summaryLines.length > 0) {
      sections.push({
        title: 'Summary',
        lines: summaryLines,
      });
    }


    const sampleRows = primary.rows.slice(0, 3);
    if (sampleRows.length > 0) {
      const columnKeys =
        primary.columns.length > 0 ? primary.columns : Object.keys(sampleRows[0] ?? {});
      const rowLines = sampleRows.map((row, index) => {
        const cells = columnKeys
          .map((column) => {
            const value = row[column];
            if (value === undefined || value === null || value === '') {
              return `${column}: N/A`;
            }
            return `${column}: ${shorten(String(value), 60)}`;
          })
          .join(' | ');
        return `${index + 1}. ${cells}`;
      });


      const remaining = primary.rows.length - sampleRows.length;
      sections.push({
        title: 'Sample rows',
        lines: rowLines,
        footnote:
          remaining > 0 ? `... ${remaining} additional row${remaining === 1 ? '' : 's'} not shown.` : undefined,
      });
    }


    if (tables.length > 1) {
      sections.push({
        lines: [`Additional tables: ${tables.length - 1} more result set${tables.length - 1 === 1 ? '' : 's'} available.`],
      });
    }
  }


  if (!sections.length && analyses.length > 0) {
    sections.push({
      title: 'Analysis',
      lines: [
        ...(queryLine ? [queryLine] : []),
        shorten(analyses[analyses.length - 1], 320),
      ],
    });
  }


  if (!sections.length) {
    sections.push({
      lines: [
        ...(queryLine ? [queryLine] : []),
        'No structured output returned from the Excel tool.',
      ].filter(Boolean),
    });
  }


  next.detailSections = sections;
  next.detail = sectionsToDetail(sections);
  return next;
};