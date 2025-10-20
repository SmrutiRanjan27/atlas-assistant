/**
 * Service for handling chat streaming functionality
 */

import { authAPI } from '../lib/auth';
import type { ServerEvent, ChatRequest } from '../types';

/**
 * Service class for chat operations
 */
export class ChatService {
  /**
   * Stream chat responses for a message
   */
  static async streamChatResponse(
    request: ChatRequest,
    onEvent: (event: ServerEvent) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    const baseUrl = authAPI.baseUrl;
    const token = authAPI.getToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    try {
      const response = await fetch(`${baseUrl}/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (response.status === 401) {
        throw new Error('Authentication failed');
      }
      
      if (!response.ok || !response.body) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            try {
              const payload = JSON.parse(line) as ServerEvent;
              onEvent(payload);
            } catch (error) {
              console.error('Failed to parse event line', line, error);
            }
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }

      const tail = buffer.trim();
      if (tail) {
        try {
          const payload = JSON.parse(tail) as ServerEvent;
          onEvent(payload);
        } catch (error) {
          console.error('Failed to parse trailing payload', tail, error);
        }
      }
    } catch (error) {
      if (onError) {
        onError(error as Error);
      } else {
        throw error;
      }
    }
  }
}