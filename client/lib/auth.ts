/**
 * Authentication utilities for token storage and API client
 */

import { debugAPI } from './debug';

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  name: string;
  password: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface UserUpdateRequest {
  name?: string;
  password?: string;
}

const TOKEN_KEY = "atlas_auth_token";

export class AuthStorage {
  static getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  static setToken(token: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, token);
  }

  static removeToken(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
  }

  static hasToken(): boolean {
    return !!this.getToken();
  }
}

export class AuthAPI {
  public baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_ASSISTANT_API || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
  }

  getToken(): string | null {
    return AuthStorage.getToken();
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = AuthStorage.getToken();
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token && !endpoint.includes("/auth/login") && !endpoint.includes("/auth/register")) {
      headers.Authorization = `Bearer ${token}`;
    }

    const requestOptions = {
      ...options,
      headers,
    };

    debugAPI.logRequest(url, requestOptions);

    const response = await fetch(url, requestOptions);

    if (response.status === 401) {
      // Token expired or invalid, clear it
      debugAPI.logAuth('Token expired, clearing storage');
      AuthStorage.removeToken();
      debugAPI.logError(url, new Error('Authentication failed'));
      throw new Error("Authentication failed");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.detail || `Request failed with status ${response.status}`);
      debugAPI.logError(url, error);
      throw error;
    }

    // Handle empty responses (like 204 No Content from DELETE requests)
    const contentType = response.headers.get('content-type');
    if (response.status === 204 || !contentType?.includes('application/json')) {
      debugAPI.logResponse(url, response, null);
      return null as T;
    }

    // Try to parse JSON, but handle empty responses gracefully
    const text = await response.text();
    if (!text.trim()) {
      debugAPI.logResponse(url, response, null);
      return null as T;
    }

    const data = JSON.parse(text);
    debugAPI.logResponse(url, response, data);
    return data;
  }

  async login(credentials: LoginRequest): Promise<Token> {
    return this.makeRequest<Token>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  }

  async register(userData: RegisterRequest): Promise<User> {
    return this.makeRequest<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.makeRequest<User>("/auth/me");
  }

  async updateProfile(userData: UserUpdateRequest): Promise<User> {
    return this.makeRequest<User>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(userData),
    });
  }

  // Generic method for making authenticated requests
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.makeRequest<T>(endpoint, options);
  }
}

export const authAPI = new AuthAPI();