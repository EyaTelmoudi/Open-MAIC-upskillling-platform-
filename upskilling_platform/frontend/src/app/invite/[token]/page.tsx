"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { acceptInvitation } from "@/app/lib/api";
import { Input } from "@/app/components/ui/Input";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    
    if (!token) {
      setError("Invalid invitation token");
      return;
    }

    setLoading(true);
    try {
      const response = await acceptInvitation({
        token,
        password,
        password_confirm: passwordConfirm,
      });
      
      localStorage.setItem("access_token", response.access_token);
      localStorage.setItem("refresh_token", response.refresh_token);
      localStorage.setItem("user", JSON.stringify(response.user));
      
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
        <div className="bg-[#1A1D27] rounded-2xl p-8 max-w-md w-full border border-[#2A2D3E]">
          <div className="text-center">
            <div className="text-red-400 text-lg mb-2">Invalid Invitation</div>
            <p className="text-gray-400">This invitation link is invalid or has expired.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="bg-[#1A1D27] rounded-2xl p-8 max-w-md w-full border border-[#2A2D3E]">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Accept Invitation</h1>
          <p className="text-gray-400">Set your password to complete your admin account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#FF6B6B]/20 border border-[#FF6B6B]/40 rounded-lg text-[#FF6B6B] text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2 text-white mt-1"
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">Confirm Password</label>
            <Input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="w-full rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2 text-white mt-1"
              placeholder="Confirm your password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#6C63FF] text-white rounded-lg font-medium hover:bg-[#5a52d4] disabled:opacity-50 transition-colors"
          >
            {loading ? "Setting up account..." : "Complete Setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
