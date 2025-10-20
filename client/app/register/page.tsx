"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { register, isAuthenticated, isLoading: authLoading } = useAuth();
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

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const validateForm = () => {
    if (!formData.username.trim()) {
      setError("Username is required");
      return false;
    }
    if (!formData.email.trim()) {
      setError("Email is required");
      return false;
    }
    if (!formData.email.includes("@")) {
      setError("Please enter a valid email address");
      return false;
    }
    if (!formData.name.trim()) {
      setError("Name is required");
      return false;
    }
    if (formData.password.length < 1) {
      setError("Password is required");
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      await register({
        username: formData.username,
        email: formData.email,
        name: formData.name,
        password: formData.password,
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex w-full max-w-[450px] flex-col">
      <div className="rounded-[26px] border border-[rgba(124,108,255,0.25)] bg-[rgba(16,21,42,0.85)] p-8 shadow-atlas-lg backdrop-blur-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-atlas-text">
            Join Atlas Assistant
          </h1>
          <p className="mt-2 text-sm text-atlas-text-secondary">
            Create your account to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-atlas-text mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={formData.username}
              onChange={handleChange("username")}
              required
              disabled={isLoading}
              className="w-full rounded-2xl border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-4 py-3 text-atlas-text placeholder-atlas-text-secondary transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,108,255,0.25)] disabled:opacity-60"
              placeholder="Choose a username"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-atlas-text mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={handleChange("email")}
              required
              disabled={isLoading}
              className="w-full rounded-2xl border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-4 py-3 text-atlas-text placeholder-atlas-text-secondary transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,108,255,0.25)] disabled:opacity-60"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-atlas-text mb-2">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={handleChange("name")}
              required
              disabled={isLoading}
              className="w-full rounded-2xl border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-4 py-3 text-atlas-text placeholder-atlas-text-secondary transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,108,255,0.25)] disabled:opacity-60"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-atlas-text mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={handleChange("password")}
              required
              disabled={isLoading}
              className="w-full rounded-2xl border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-4 py-3 text-atlas-text placeholder-atlas-text-secondary transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,108,255,0.25)] disabled:opacity-60"
              placeholder="Create a password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-atlas-text mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange("confirmPassword")}
              required
              disabled={isLoading}
              className="w-full rounded-2xl border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-4 py-3 text-atlas-text placeholder-atlas-text-secondary transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none focus:ring-2 focus:ring-[rgba(124,108,255,0.25)] disabled:opacity-60"
              placeholder="Confirm your password"
            />
          </div>

          {error && (
            <div className="rounded-2xl bg-[rgba(255,92,128,0.15)] border border-[rgba(255,92,128,0.35)] px-4 py-3 text-sm text-atlas-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-2xl bg-gradient-to-r from-[rgba(124,108,255,0.95)] to-[rgba(42,229,185,0.9)] px-5 py-3 font-semibold text-atlas-text transition hover:translate-y-[-1px] hover:shadow-[0_12px_28px_rgba(124,108,255,0.35)] disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none disabled:shadow-none"
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-atlas-text-secondary">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-atlas-accent-strong transition hover:text-atlas-text hover:underline"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}