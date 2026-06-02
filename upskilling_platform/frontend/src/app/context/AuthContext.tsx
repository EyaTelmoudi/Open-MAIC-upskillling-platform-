"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, IDENTITY_URL, tryRefreshAccessToken } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

function sanitizeToken(token: string | null | undefined): string | null {
  const value = String(token || "").trim();
  if (!value || value === "undefined" || value === "null") {
    return null;
  }
  return value.split(".").length === 3 ? value : null;
}

function decodeJwt(token: string): { sub: string; email: string; role: string; tenantId: string | null } | null {
  const cleanToken = sanitizeToken(token);
  if (!cleanToken) return null;
  try {
    const parts = cleanToken.split(".");
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const payload = JSON.parse(atob(padded));
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId || null,
    };
  } catch {
    return null;
  }
}

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar: string | null;
  role: string;
  status: string;
  department: string | null;
  bio: string | null;
  skills: string[];
  created_at: string;
  updated_at: string;
  timezone?: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

async function requestLogin(path: string, body: { email: string; password: string }): Promise<TokenResponse> {
  const response = await fetch(`${IDENTITY_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Login failed");
  }

  return response.json();
}

interface AuthContextType {
  user: User | null;
  tenantId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginLocal: (email: string, password: string, tenant?: string) => Promise<void>;
  loginAzure: (tenant?: string) => void;
  logout: () => void;
  refreshToken: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SOLO_CHALLENGE_SESSION_PREFIX = "sf_solo_challenge_welcome_seen:";
const LOGIN_SESSION_STORAGE_KEY = "sf_login_session_id";
const SOLO_CHALLENGE_PENDING_LOGIN_KEY = "sf_solo_challenge_pending_login_session";
const WORKSPACE_VIEW_COOKIE = "sf_workspace_view";

function clearSoloChallengeSessionFlags() {
  if (typeof window === "undefined") {
    return;
  }

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(SOLO_CHALLENGE_SESSION_PREFIX)) {
      window.sessionStorage.removeItem(key);
    }
  }
}

function markNewLoginSession() {
  if (typeof window === "undefined") {
    return;
  }

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(LOGIN_SESSION_STORAGE_KEY, sessionId);
  window.sessionStorage.setItem(SOLO_CHALLENGE_PENDING_LOGIN_KEY, sessionId);
}

function getCookieToken(name: "access_token" | "refresh_token") {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return sanitizeToken(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user;

  const clearLocalSession = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = `${WORKSPACE_VIEW_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = sanitizeToken(localStorage.getItem("access_token")) || getCookieToken("access_token");
      if (token) {
        const decoded = decodeJwt(token);
        setTenantId(decoded?.tenantId || null);
      } else {
        setUser(null);
        setTenantId(null);
        setIsLoading(false);
        return null;
      }
      const userData = await api.get<User>("/api/v1/identity/users/me");
      setUser(userData);
      return userData;
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status === 401 || status === 403) {
        const refreshed = await tryRefreshAccessToken();
        if (refreshed) {
          try {
            const userData = await api.get<User>("/api/v1/identity/users/me");
            setUser(userData);
            return userData;
          } catch {
            // Fall through to clearing auth below.
          }
        }
        clearLocalSession();
      }
      setUser(null);
      setTenantId(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [clearLocalSession]);

  useEffect(() => {
    const token = sanitizeToken(localStorage.getItem("access_token")) || getCookieToken("access_token");
    if (token) {
      if (typeof window !== "undefined" && !window.sessionStorage.getItem(LOGIN_SESSION_STORAGE_KEY)) {
        markNewLoginSession();
      }
      fetchCurrentUser();
    } else {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  const persistTokens = (tokens: TokenResponse) => {
    const accessToken = sanitizeToken(tokens.access_token);
    const refreshToken = sanitizeToken(tokens.refresh_token);
    if (!accessToken || !refreshToken) {
      throw new Error("Login response did not include valid tokens");
    }
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    document.cookie = `access_token=${encodeURIComponent(accessToken)}; path=/; max-age=${tokens.expires_in || 900}; SameSite=Lax`;
    document.cookie = `refresh_token=${encodeURIComponent(refreshToken)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  };

  const loginLocal = async (email: string, password: string, tenant?: string) => {
    let tokens: TokenResponse | null = null;

    try {
      const url = tenant
        ? `/api/v1/auth/login/local?tenant=${tenant}`
        : "/api/v1/auth/login/local";
      tokens = await requestLogin(url, { email, password });
    } catch (err) {
      if (tenant) {
        throw err;
      }

      tokens = await requestLogin("/api/v1/auth/login/superadmin", {
        email,
        password,
      });
    }

    persistTokens(tokens);
    markNewLoginSession();
    const verifiedUser = await fetchCurrentUser();
    if (!verifiedUser) {
      throw new Error("Login succeeded but the session could not be verified");
    }
    const decoded = decodeJwt(tokens.access_token);
    router.push(
      decoded?.role === "SuperAdmin"
        ? routes.superadmin
        : decoded?.role === "Admin"
          ? routes.adminUsers
        : decoded?.role === "LearningExpert"
          ? routes.adminCourses
        : decoded?.role === "TeamManager"
          ? routes.teamManagerTeams
          : routes.dashboard
    );
  };

    const loginAzure = (tenant?: string) => {
    const baseUrl = IDENTITY_URL;
    const url = tenant 
      ? `${baseUrl}/api/v1/auth/login/azure?tenant=${tenant}`
      : `${baseUrl}/api/v1/auth/login/azure`;
    window.location.href = url;
  };

  const logout = () => {
    clearLocalSession();
    clearSoloChallengeSessionFlags();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(LOGIN_SESSION_STORAGE_KEY);
      window.sessionStorage.removeItem(SOLO_CHALLENGE_PENDING_LOGIN_KEY);
    }
    setUser(null);
    setTenantId(null);
    router.push(routes.login);
  };

  const refreshToken = async () => {
    const refreshed = await tryRefreshAccessToken();
    if (!refreshed) {
      logout();
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    const updated = await api.put<User>(
      "/api/v1/identity/users/profile",
      data
    );
    setUser(updated);
  };

  const uploadAvatar = async (file: File) => {
    const updated = await api.uploadFile<User>(
      "/api/v1/identity/users/me/avatar",
      file
    );
    setUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenantId,
        isLoading,
        isAuthenticated,
        loginLocal,
        loginAzure,
        logout,
        refreshToken,
        updateProfile,
        uploadAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
