"use client";

import { useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { PasswordField } from "@/app/components/ui/PasswordField";

interface LoginFormProps {
  tenant?: string;
}

export function LoginForm({ tenant = "" }: LoginFormProps) {
  const { loginLocal } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await loginLocal(email, password, tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-slate-900">
          Email
        </label>
        <Input
          id="email"
          type="email"
          placeholder="admin@skillforge.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-900">
          Password
        </label>
        <PasswordField
          id="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm"
        />
      </div>
      {error && (
        <div className="rounded-[10px] bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button type="submit" className="w-full shadow-sm" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}
