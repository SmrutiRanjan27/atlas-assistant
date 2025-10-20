/**
 * Refactored chat page hook with better separation of concerns
 */

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useConversations } from './useConversations';
import { useActiveConversation } from './useActiveConversation';
import { ChatService } from '../services';
import { 
  generateId, 
  createToolEvent, 
  completeToolEvent, 
  coerceJson, 
  formatTimestamp 
} from '../utils/chat';
import type { MessageEntry, ServerEvent, ToolEvent } from '../types';

interface UseChatPageReturn {
  // Conversation management
  conversations: ReturnType<typeof useConversations>['conversations'];
  activeConversationId: string | null;
  messages: MessageEntry[];
  
  // UI state
  input: string;
  setInput: (value: string) => void;
  isStreaming: boolean;
  isLoadingConversation: boolean;
  isLoadingConversations: boolean;
  isHistoryOpen: boolean;
  disableInteractions: boolean;
  feedRef: React.RefObject<HTMLDivElement>;
  
  // Actions
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  startNewConversation: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  handleDeleteConversation: (id: string) => Promise<void>;
  openHistory: () => void;
  closeHistory: () => void;
  
  // Utilities
  formatTimestamp: typeof formatTimestamp;
}

/**
 * Main hook for chat page functionality
 */
export function useChatPage(): UseChatPageReturn {
  // Sub-hooks for different concerns
  const {
    conversations,
    isLoading: isLoadingConversations,
    createConversation,
    deleteConversation,
    refreshConversations,
  } = useConversations();

  const {
    activeConversationId,
    messages,
    isLoadingConversation,
    emptyConversationIds,
    selectConversation: selectConversationBase,
    setActiveConversationId,
    setMessages,
    setEmptyConversationIds,
  } = useActiveConversation();

  // Local state
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Refs
  const feedRef = useRef<HTMLDivElement | null>(null);
  const isStreamingRef = useRef(false);

  // Keep streaming ref in sync
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-scroll messages
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  /**
   * Ensure there's an active conversation, creating one if needed
   */
  const ensureActiveConversation = useCallback(async (): Promise<string> => {
    if (activeConversationId) {
      return activeConversationId;
    }
    const summary = await createConversation();
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
  }, [activeConversationId, createConversation, setActiveConversationId, setEmptyConversationIds]);

  /**
   * Handle server events during streaming
   */
  const handleEvent = useCallback((assistantMessageId: string, payload: ServerEvent) => {
    const upsertAssistant = (updater: (entry: MessageEntry | undefined) => MessageEntry | null) => {
      setMessages((prev) => {
        const index = prev.findIndex(
          (item) => item.type === 'message' && item.id === assistantMessageId && item.role === 'assistant',
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
      case 'checkpoint': {
        setActiveConversationId(payload.checkpoint_id);
        void refreshConversations();
        break;
      }
      case 'response_chunk': {
        upsertAssistant((entry) => {
          const base = entry ?? ({
            id: assistantMessageId,
            type: 'message',
            role: 'assistant',
            content: '',
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
      case 'final_response': {
        const finalText = payload.text ?? '';
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
              type: 'message',
              role: 'assistant',
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
      case 'tool_call': {
        const toolInput = coerceJson(payload.input);
        const event = createToolEvent(payload.tool_name, toolInput);
        upsertAssistant((entry) => {
          const base = entry ?? ({
            id: assistantMessageId,
            type: 'message',
            role: 'assistant',
            content: '',
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
      case 'tool_result': {
        upsertAssistant((entry) => {
          const base = entry ?? ({
            id: assistantMessageId,
            type: 'message',
            role: 'assistant',
            content: '',
            isStreaming: true,
            toolEvents: [],
          } satisfies MessageEntry);
          const existingEvents = base.toolEvents ?? [];
          let matched = false;
          const nextEvents = existingEvents.map((event) => {
            if (!matched && event.toolName === payload.tool_name && event.status === 'running') {
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
      case 'error': {
        const errorEvent: ToolEvent = {
          id: generateId(),
          toolName: 'Agent',
          status: 'error',
          detail: payload.message,
        };
        upsertAssistant((entry) => {
          const base = entry ?? ({
            id: assistantMessageId,
            type: 'message',
            role: 'assistant',
            content: '',
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
      case 'done': {
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
    }
  }, [refreshConversations, setActiveConversationId, setMessages]);

  /**
   * Submit a chat message
   */
  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
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

    const userMessageId = generateId();
    const assistantMessageId = generateId();

    setMessages((prev) => [
      ...prev,
      { id: userMessageId, type: 'message', role: 'user', content: value },
      {
        id: assistantMessageId,
        type: 'message',
        role: 'assistant',
        content: '',
        isStreaming: true,
        toolEvents: [],
      },
    ]);

    setInput('');
    setIsStreaming(true);

    await ChatService.streamChatResponse(
      {
        message: value,
        checkpoint_id: conversationId,
      },
      (serverEvent) => handleEvent(assistantMessageId, serverEvent),
      (error) => {
        console.error('Chat streaming error:', error);
        handleEvent(assistantMessageId, { 
          type: 'error', 
          message: error.message || 'Unexpected error' 
        });
      }
    );
  }, [ensureActiveConversation, handleEvent, input, isStreaming, setEmptyConversationIds, setMessages]);

  /**
   * Start a new conversation
   */
  const startNewConversation = useCallback(async () => {
    if (isStreaming) {
      return;
    }

    if (activeConversationId && messages.length === 0) {
      setIsHistoryOpen(false);
      return;
    }

    // Look for reusable empty conversation
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
      await selectConversationBase(reusableId);
      setIsHistoryOpen(false);
      return;
    }

    const summary = await createConversation();
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
  }, [
    activeConversationId,
    conversations,
    createConversation,
    emptyConversationIds,
    isStreaming,
    messages,
    selectConversationBase,
    setActiveConversationId,
    setEmptyConversationIds,
    setMessages,
  ]);

  /**
   * Select a conversation and close history panel
   */
  const selectConversation = useCallback(async (conversationId: string) => {
    await selectConversationBase(conversationId);
    setIsHistoryOpen(false);
  }, [selectConversationBase]);

  /**
   * Delete a conversation
   */
  const handleDeleteConversation = useCallback(async (conversationId: string) => {
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
    
    await deleteConversation(conversationId);
    if (wasActive) {
      await startNewConversation();
    }
  }, [activeConversationId, deleteConversation, isStreaming, setEmptyConversationIds, startNewConversation]);

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
    formatTimestamp,
  };
}