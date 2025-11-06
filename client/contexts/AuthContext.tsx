"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  AuthAPI,
  AuthStorage,
  LoginRequest,
  RegisterRequest,
  User,
  UserUpdateRequest,
} from "../lib/auth";
import { debugAPI } from "../lib/debug";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (userData: RegisterRequest) => Promise<void>;
  logout: () => void;
  updateProfile: (userData: UserUpdateRequest) => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ✅ Re-add AuthContext
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Memoize AuthAPI to keep it stable
  const authAPI = useMemo(() => new AuthAPI(), []);

  const isAuthenticated = !!user;

  const loadUser = useCallback(async () => {
    try {
      if (!AuthStorage.hasToken()) {
        setIsLoading(false);
        return;
      }
      const userData = await authAPI.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error("Failed to load user:", error);
      const status =
        typeof error === "object" && error && "status" in error
          ? (error as { status?: number }).status
          : null;
      if (status === 401) {
        AuthStorage.removeToken();
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [authAPI]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (credentials: LoginRequest) => {
    try {
      const tokenData = await authAPI.login(credentials);
      AuthStorage.setToken(tokenData.access_token);
      const userData = await authAPI.getCurrentUser();
      debugAPI.logAuth("User logged in successfully", {
        username: userData.username,
      });
      setUser(userData);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const register = async (userData: RegisterRequest) => {
    try {
      await authAPI.register(userData);
      await login({
        username: userData.username,
        password: userData.password,
      });
    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    }
  };

  const logout = () => {
    debugAPI.logAuth("User logged out");
    AuthStorage.removeToken();
    setUser(null);
  };

  const updateProfile = async (userData: UserUpdateRequest) => {
    try {
      const updatedUser = await authAPI.updateProfile(userData);
      setUser(updatedUser);
    } catch (error) {
      console.error("Profile update failed:", error);
      throw error;
    }
  };

  const refreshUser = useCallback(async () => {
    try {
      if (!AuthStorage.hasToken()) {
        return;
      }
      const userData = await authAPI.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error("Failed to refresh user:", error);
      const status =
        typeof error === "object" && error && "status" in error
          ? (error as { status?: number }).status
          : null;
      if (status === 401) {
        AuthStorage.removeToken();
        setUser(null);
      }
    }
  }, [authAPI]);

  useEffect(() => {
    const handleFocus = () => {
      if (AuthStorage.hasToken()) {
        refreshUser();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshUser]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    updateProfile,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
