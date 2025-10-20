"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, authLoading, router]);

  if (authLoading) {
    return (
      <main className="flex w-full max-w-[450px] flex-col items-center justify-center">
        <div className="rounded-[26px] border border-[rgba(124,108,255,0.25)] bg-[rgba(16,21,42,0.85)] p-8 shadow-atlas-lg backdrop-blur-2xl">
          <div className="flex items-center justify-center gap-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent"></div>
            <span className="text-atlas-text">Loading...</span>
          </div>
        </div>
      </main>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login({ username, password });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex w-full max-w-[450px] flex-col">
      <div className="rounded-[26px] border border-[rgba(124,108,255,0.25)] bg-[rgba(16,21,42,0.85)] p-8 shadow-atlas-lg backdrop-blur-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-atlas-text">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-atlas-text-secondary">
            Sign in to your Atlas Assistant account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-atlas-text mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isLoading}
              className="w-full rounded-2xl border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-4 py-3 text-atlas-text placeholder-atlas-text-secondary transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,108,255,0.25)] disabled:opacity-60"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-atlas-text mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full rounded-2xl border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-4 py-3 text-atlas-text placeholder-atlas-text-secondary transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,108,255,0.25)] disabled:opacity-60"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="rounded-2xl bg-[rgba(255,92,128,0.15)] border border-[rgba(255,92,128,0.35)] px-4 py-3 text-sm text-atlas-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full rounded-2xl bg-gradient-to-r from-[rgba(124,108,255,0.95)] to-[rgba(42,229,185,0.9)] px-5 py-3 font-semibold text-atlas-text transition hover:translate-y-[-1px] hover:shadow-[0_12px_28px_rgba(124,108,255,0.35)] disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none disabled:shadow-none"
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-atlas-text-secondary">
            Don't have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-atlas-accent-strong transition hover:text-atlas-text hover:underline"
            >
              Sign up here
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}