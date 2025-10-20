/**
 * Hook for managing active conversation and its messages
 */

import { useCallback, useState, useEffect } from 'react';
import { ConversationService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { buildChatEntriesFromDetail } from '../utils/chat';
import type { ChatEntry } from '../types';

interface UseActiveConversationReturn {
  activeConversationId: string | null;
  messages: ChatEntry[];
  isLoadingConversation: boolean;
  emptyConversationIds: Set<string>;
  loadConversation: (id: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatEntry[]>>;
  setEmptyConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

/**
 * Hook for managing the currently active conversation
 */
export function useActiveConversation(): UseActiveConversationReturn {
  const { logout, isAuthenticated } = useAuth();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [emptyConversationIds, setEmptyConversationIds] = useState<Set<string>>(() => new Set());

  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof Error && error.message.includes('Authentication failed')) {
      console.warn('Authentication failed, logging out user');
      logout();
      return true;
    }
    return false;
  }, [logout]);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!isAuthenticated) {
      // Clear state if not authenticated
      setActiveConversationId(null);
      setMessages([]);
      return;
    }
    
    setIsLoadingConversation(true);
    try {
      const detail = await ConversationService.getConversation(conversationId);
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
      console.error('Failed to load conversation:', error);
      if (handleAuthError(error)) {
        return;
      }
    } finally {
      setIsLoadingConversation(false);
    }
  }, [handleAuthError, isAuthenticated]);

  const selectConversation = useCallback(async (conversationId: string) => {
    await loadConversation(conversationId);
  }, [loadConversation]);

  // Clear active conversation when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setActiveConversationId(null);
      setMessages([]);
      setEmptyConversationIds(new Set());
      setIsLoadingConversation(false);
    }
  }, [isAuthenticated]);

  return {
    activeConversationId,
    messages,
    isLoadingConversation,
    emptyConversationIds,
    loadConversation,
    selectConversation,
    setActiveConversationId,
    setMessages,
    setEmptyConversationIds,
  };
}