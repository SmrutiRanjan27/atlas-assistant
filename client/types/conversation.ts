/**
 * Conversation-related types for the client application
 */

export interface ConversationSummaryResponse {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageResponse {
  kind: 'message' | 'tool';
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_name?: string;
  tool_status?: 'start' | 'complete' | 'error';
  tool_call_id?: string | null;
  tool_input?: unknown;
  tool_output?: unknown;
}

export interface ConversationDetailResponse extends ConversationSummaryResponse {
  messages: ConversationMessageResponse[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessageResponse[];
}

export interface ConversationCreateRequest {
  title?: string;
}