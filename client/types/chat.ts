/**
 * Chat-related types for the client application
 */

import { ToolEvent } from './tool';

export interface MessageEntry {
  id: string;
  type: 'message';
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  toolEvents?: ToolEvent[];
}

export type ChatEntry = MessageEntry;

export type ServerEvent =
  | { type: 'checkpoint'; checkpoint_id: string }
  | { type: 'response_chunk'; text: string; checkpoint_id: string }
  | { type: 'final_response'; text: string; checkpoint_id: string }
  | { type: 'tool_call'; tool_name: string; input: unknown; checkpoint_id: string }
  | { type: 'tool_result'; tool_name: string; output: unknown; checkpoint_id: string }
  | { type: 'error'; message: string; checkpoint_id?: string }
  | { type: 'done'; checkpoint_id: string };

export interface ChatRequest {
  message: string;
  checkpoint_id: string;
}