/**
 * Debug utilities for API calls and authentication
 */

export const debugAPI = {
  logRequest: (url: string, options: RequestInit) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🌐 API Request:', {
        url,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body ? JSON.parse(options.body as string) : null,
      });
    }
  },

  logResponse: (url: string, response: Response, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ API Response:', {
        url,
        status: response.status,
        statusText: response.statusText,
        data: data ? (typeof data === 'string' ? data.slice(0, 100) + '...' : data) : null,
      });
    }
  },

  logError: (url: string, error: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ API Error:', {
        url,
        error: error.message || error,
        stack: error.stack,
      });
    }
  },

  logAuth: (action: string, details?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔐 Auth:', action, details);
    }
  },
};