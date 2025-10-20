/**
 * Service for handling conversation-related API calls
 */

import { authAPI } from '../lib/auth';
import type { 
  ConversationSummary, 
  ConversationDetail, 
  ConversationSummaryResponse, 
  ConversationDetailResponse,
  ConversationCreateRequest 
} from '../types';

/**
 * Transform conversation summary response to client format
 */
const toSummary = (payload: ConversationSummaryResponse): ConversationSummary => ({
  id: payload.id,
  title: payload.title,
  createdAt: payload.created_at,
  updatedAt: payload.updated_at,
});

/**
 * Transform conversation detail response to client format
 */
const toDetail = (payload: ConversationDetailResponse): ConversationDetail => ({
  ...toSummary(payload),
  messages: payload.messages,
});

/**
 * Service class for conversation operations
 */
export class ConversationService {
  /**
   * List all conversations for the current user
   */
  static async listConversations(): Promise<ConversationSummary[]> {
    const payload = await authAPI.request<ConversationSummaryResponse[]>('/conversations');
    return payload.map(toSummary);
  }

  /**
   * Get detailed conversation by ID
   */
  static async getConversation(conversationId: string): Promise<ConversationDetail> {
    const payload = await authAPI.request<ConversationDetailResponse>(`/conversations/${conversationId}`);
    return toDetail(payload);
  }

  /**
   * Create a new conversation
   */
  static async createConversation(request: ConversationCreateRequest = {}): Promise<ConversationSummary> {
    const payload = await authAPI.request<ConversationSummaryResponse>('/conversations', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return toSummary(payload);
  }

  /**
   * Delete a conversation by ID
   */
  static async deleteConversation(conversationId: string): Promise<void> {
    await authAPI.request(`/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  }
}