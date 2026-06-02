"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "../components/ui/Input";
import { IDENTITY_URL } from "../lib/api";

export default function SetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing invitation token.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${IDENTITY_URL}/api/v1/auth/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          password_confirm: confirmPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to set password.");
      }

      const data = await response.json();
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      document.cookie = `access_token=${data.access_token}; path=/; max-age=${data.expires_in || 900}; SameSite=Lax`;
      document.cookie = `refresh_token=${data.refresh_token}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

      setSuccess(true);

      setTimeout(() => {
        router.push("/onboarding");
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F1117] p-4">
        <div className="max-w-md w-full rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white">Password Set!</h1>
          <p className="text-gray-400">Your account is now active. Redirecting you to the platform...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F1117] p-4 font-[family-name:var(--font-geist-sans)]">
      <div className="max-w-md w-full">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#6C63FF]">
            <span className="text-xl font-bold text-white">S</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Setup Your Account</h1>
          <p className="mt-2 text-gray-400">Create a secure password to activate your admin account.</p>
        </div>

        <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">New Password</label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#2A2D3E] bg-[#0F1117] px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-[#6C63FF]"
                placeholder="Password"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Confirm Password</label>
              <Input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-[#2A2D3E] bg-[#0F1117] px-4 py-3 text-white transition-all focus:outline-none focus:ring-2 focus:ring-[#6C63FF]"
                placeholder="Confirm password"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full rounded-xl bg-[#6C63FF] py-3 font-semibold text-white transition-all shadow-lg shadow-[#6C63FF]/20 hover:bg-[#5a52d4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Setting Password..." : "Activate Account"}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          &copy; 2026 SkillForge Upskilling Platform. All rights reserved.
        </p>
      </div>
    </div>
  );
}
