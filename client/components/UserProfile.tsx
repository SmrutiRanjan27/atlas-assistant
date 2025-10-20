"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

export function UserProfile() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsEditingProfile(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) {
    return null;
  }

  const initials = user.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-[rgba(124,108,255,0.95)] to-[rgba(42,229,185,0.9)] text-sm font-semibold text-atlas-text transition hover:shadow-[0_8px_20px_rgba(124,108,255,0.35)] hover:scale-105"
      >
        {initials}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-[rgba(124,108,255,0.25)] bg-[rgba(16,21,42,0.95)] p-4 shadow-atlas-lg backdrop-blur-2xl">
          {!isEditingProfile ? (
            <UserProfileDisplay 
              user={user} 
              onEdit={() => setIsEditingProfile(true)}
              onLogout={handleLogout}
            />
          ) : (
            <UserProfileEdit 
              user={user} 
              onCancel={() => setIsEditingProfile(false)}
              onComplete={() => setIsEditingProfile(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface UserProfileDisplayProps {
  user: any;
  onEdit: () => void;
  onLogout: () => void;
}

function UserProfileDisplay({ user, onEdit, onLogout }: UserProfileDisplayProps) {
  return (
    <>
      <div className="mb-4 border-b border-[rgba(124,108,255,0.25)] pb-4">
        <h3 className="font-semibold text-atlas-text">{user.name}</h3>
        <p className="text-sm text-atlas-text-secondary">@{user.username}</p>
        <p className="text-sm text-atlas-text-secondary">{user.email}</p>
      </div>
      
      <div className="space-y-2">
        <button
          onClick={onEdit}
          className="w-full rounded-xl bg-[rgba(8,12,28,0.75)] px-4 py-2 text-left text-sm text-atlas-text transition hover:bg-[rgba(124,108,255,0.15)] hover:text-atlas-accent-strong"
        >
          Edit Profile
        </button>
        
        <button
          onClick={onLogout}
          className="w-full rounded-xl px-4 py-2 text-left text-sm text-atlas-danger transition hover:bg-[rgba(255,92,128,0.15)]"
        >
          Sign Out
        </button>
      </div>
    </>
  );
}

interface UserProfileEditProps {
  user: any;
  onCancel: () => void;
  onComplete: () => void;
}

function UserProfileEdit({ user, onCancel, onComplete }: UserProfileEditProps) {
  const [formData, setFormData] = useState({
    name: user.name,
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { updateProfile } = useAuth();

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate passwords if changing password
    if (formData.password) {
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setIsLoading(true);
    try {
      const updateData: any = {};
      
      if (formData.name !== user.name) {
        updateData.name = formData.name;
      }
      
      if (formData.password) {
        updateData.password = formData.password;
      }

      // Only update if there are changes
      if (Object.keys(updateData).length > 0) {
        await updateProfile(updateData);
      }
      
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="mb-4 border-b border-[rgba(124,108,255,0.25)] pb-3">
        <h3 className="font-semibold text-atlas-text">Edit Profile</h3>
        <p className="text-sm text-atlas-text-secondary">@{user.username}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-atlas-text-secondary mb-1">
            Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={handleChange("name")}
            disabled={isLoading}
            className="w-full rounded-lg border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-3 py-2 text-sm text-atlas-text transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-atlas-text-secondary mb-1">
            New Password (optional)
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={handleChange("password")}
            disabled={isLoading}
            className="w-full rounded-lg border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-3 py-2 text-sm text-atlas-text transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none disabled:opacity-60"
            placeholder="Leave blank to keep current"
          />
        </div>

        {formData.password && (
          <div>
            <label className="block text-xs font-medium text-atlas-text-secondary mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange("confirmPassword")}
              disabled={isLoading}
              className="w-full rounded-lg border border-[rgba(124,108,255,0.35)] bg-[rgba(8,12,28,0.75)] px-3 py-2 text-sm text-atlas-text transition focus:border-[rgba(124,108,255,0.75)] focus:outline-none disabled:opacity-60"
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-[rgba(255,92,128,0.15)] border border-[rgba(255,92,128,0.35)] px-3 py-2 text-xs text-atlas-danger">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-[rgba(124,108,255,0.35)] px-4 py-2 text-sm text-atlas-text-secondary transition hover:border-[rgba(124,108,255,0.55)] hover:text-atlas-text disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 rounded-xl bg-gradient-to-r from-[rgba(124,108,255,0.95)] to-[rgba(42,229,185,0.9)] px-4 py-2 text-sm font-semibold text-atlas-text transition hover:shadow-[0_8px_20px_rgba(124,108,255,0.35)] disabled:opacity-60"
          >
            {isLoading ? "Updating..." : "Update"}
          </button>
        </div>
      </form>
    </>
  );
}