"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, IDENTITY_URL } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

function decodeJwt(token: string): { sub: string; email: string; role: string; tenantId: string | null } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (token) {
        const decoded = decodeJwt(token);
        setTenantId(decoded?.tenantId || null);
      }
       const userData = await api.get<User>("/api/v1/identity/users/me");
      setUser(userData);
    } catch {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      setUser(null);
      setTenantId(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      fetchCurrentUser();
    } else {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  const persistTokens = (tokens: TokenResponse) => {
    localStorage.setItem("access_token", tokens.access_token);
    localStorage.setItem("refresh_token", tokens.refresh_token);
    document.cookie = `access_token=${tokens.access_token}; path=/; max-age=900; SameSite=Lax`;
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
    await fetchCurrentUser();
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
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setUser(null);
    setTenantId(null);
    router.push(routes.login);
  };

   const refreshToken = async () => {
    const refreshTokenValue = localStorage.getItem("refresh_token");
    if (!refreshTokenValue) {
      logout();
      return;
    }
   try {
      const tokens = await api.post<TokenResponse>(
        "/api/v1/auth/refresh",
        { refresh_token: refreshTokenValue }
      );
      localStorage.setItem("access_token", tokens.access_token);
      localStorage.setItem("refresh_token", tokens.refresh_token);
      document.cookie = `access_token=${tokens.access_token}; path=/; max-age=900; SameSite=Lax`;
    } catch {
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
