/**
 * Hook for managing conversations list and operations
 */

import { useCallback, useState, useEffect } from 'react';
import { ConversationService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import type { ConversationSummary } from '../types';

interface UseConversationsReturn {
  conversations: ConversationSummary[];
  isLoading: boolean;
  createConversation: () => Promise<ConversationSummary>;
  deleteConversation: (id: string) => Promise<void>;
  refreshConversations: (selectLatest?: boolean) => Promise<void>;
}

/**
 * Hook for managing conversations list state and operations
 */
export function useConversations(): UseConversationsReturn {
  const { logout, isAuthenticated, isLoading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof Error && error.message.includes('Authentication failed')) {
      console.warn('Authentication failed, logging out user');
      logout();
      return true;
    }
    return false;
  }, [logout]);

  const refreshConversations = useCallback(async (selectLatest = false) => {
    // Don't try to load conversations if not authenticated
    if (!isAuthenticated) {
      setConversations([]);
      return;
    }
    
    setIsLoading(true);
    try {
      const items = await ConversationService.listConversations();
      setConversations(items);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      if (handleAuthError(error)) {
        return; // Don't throw error if auth failed, just return
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthError, isAuthenticated]);

  const createConversation = useCallback(async (): Promise<ConversationSummary> => {
    if (!isAuthenticated) {
      throw new Error('User not authenticated');
    }
    
    try {
      const summary = await ConversationService.createConversation();
      setConversations((prev) => [summary, ...prev]);
      return summary;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      if (handleAuthError(error)) {
        throw new Error('Authentication failed');
      }
      throw error;
    }
  }, [handleAuthError, isAuthenticated]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    if (!isAuthenticated) {
      throw new Error('User not authenticated');
    }
    
    try {
      await ConversationService.deleteConversation(conversationId);
      setConversations((prev) => prev.filter(c => c.id !== conversationId));
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      if (handleAuthError(error)) {
        throw new Error('Authentication failed');
      }
      throw error;
    }
  }, [handleAuthError, isAuthenticated]);

  // Load conversations when authenticated, clear when logged out
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      void refreshConversations();
    } else if (!isAuthenticated && !authLoading) {
      // Clear conversations when user logs out
      setConversations([]);
      setIsLoading(false);
    }
  }, [refreshConversations, isAuthenticated, authLoading]);

  return {
    conversations,
    isLoading,
    createConversation,
    deleteConversation,
    refreshConversations,
  };
}