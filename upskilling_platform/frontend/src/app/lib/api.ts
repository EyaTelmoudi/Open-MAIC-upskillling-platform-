export const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8000";

export const IDENTITY_URL =
  process.env.NEXT_PUBLIC_IDENTITY_URL || "http://localhost:8001";
export const LEARNING_URL =
  process.env.NEXT_PUBLIC_LEARNING_URL || "http://localhost:8002";
export const AGENTS_URL =
  process.env.NEXT_PUBLIC_AGENTS_URL || "http://localhost:8003";
export const NOTIFICATIONS_URL =
  process.env.NEXT_PUBLIC_NOTIFICATIONS_URL || "http://localhost:8004";

function isBrowser() {
  return typeof window !== "undefined";
}

function resolveBaseUrl(path: string): string {
  if (isBrowser() && path.startsWith("/api/")) {
    return "";
  }

  if (
    path.startsWith("/api/v1/auth") ||
    path.startsWith("/api/v1/identity") ||
    path.startsWith("/api/v1/sync") ||
    path.startsWith("/api/v1/superadmin") ||
    path.startsWith("/api/v1/tenants") ||
    path.startsWith("/api/v1/onboarding") ||
    path.startsWith("/setup")
  ) {
    return IDENTITY_URL;
  }

  if (path.startsWith("/api/v1/learning")) {
    if (isBrowser()) {
      return "";
    }
    return LEARNING_URL;
  }

  if (path.startsWith("/api/v1/agents")) {
    return AGENTS_URL;
  }

  if (path.startsWith("/api/v1/notifications")) {
    return NOTIFICATIONS_URL;
  }

  return GATEWAY_URL;
}

function normalizeServicePath(path: string): string {
  if (isBrowser() && path.startsWith("/api/v1/learning/")) {
    return path.replace("/api/v1/learning", "/api/learning");
  }

  if (isBrowser() && path === "/api/v1/learning") {
    return "/api/learning";
  }

  if (path.startsWith("/api/v1/learning/")) {
    return path.replace("/api/v1/learning", "/api/v1");
  }

  if (path === "/api/v1/learning") {
    return "/api/v1";
  }

  if (path.startsWith("/api/v1/agents/")) {
    return path.replace("/api/v1/agents", "/api/v1");
  }

  if (path === "/api/v1/agents") {
    return "/api/v1";
  }

  if (path.startsWith("/api/v1/notifications/")) {
    return path.replace("/api/v1/notifications", "/api/v1");
  }

  if (path === "/api/v1/notifications") {
    return "/api/v1";
  }

  return path;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  // Prefer the freshest token stored by the auth flow.
  const localToken = localStorage.getItem("access_token");
  if (localToken) {
    return localToken;
  }
  const cookieMatch = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  if (cookieMatch) {
    return cookieMatch[1];
  }
  return null;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const normalizedPath = normalizeServicePath(path);
    const resolvedBaseUrl = resolveBaseUrl(path);
    return `${resolvedBaseUrl}${normalizedPath}`;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async get<T>(path: string): Promise<T> {
    const headers = this.getHeaders();
    const res = await fetch(this.buildUrl(path), {
      headers,
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      const errorBody = await res.text();
      if (res.status !== 401) {
        console.error('[GET Error]', path, 'Status:', res.status, 'Body:', errorBody);
      }
      let errorDetail;
      try {
        errorDetail = JSON.parse(errorBody);
      } catch (e) {
        errorDetail = { detail: res.statusText };
      }
      throw new Error(errorDetail.detail || "Request failed");
    }
    return res.json();
  }

  async getBlob(path: string): Promise<Blob> {
    const headers = this.getHeaders();
    const res = await fetch(this.buildUrl(path), {
      headers,
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Download failed");
    }
    return res.blob();
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const headers = this.getHeaders();
    const res = await fetch(this.buildUrl(path), {
      method: "POST",
      headers,
      redirect: "follow",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      if (res.status !== 401) {
        console.error('[POST] Error response:', error);
      }
      throw new Error(error.detail || "Request failed");
    }
    return res.json();
  }

  async postForm<T>(path: string, formData: FormData): Promise<T> {
    const token = localStorage.getItem("access_token");
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(this.buildUrl(path), {
      method: "POST",
      headers,
      redirect: "follow",
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || "Request failed");
    }
    return res.json();
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: "PUT",
      headers: this.getHeaders(),
      redirect: "follow",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || "Request failed");
    }
    return res.json();
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: "PATCH",
      headers: this.getHeaders(),
      redirect: "follow",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || "Request failed");
    }
    return res.json();
  }

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: "DELETE",
      headers: this.getHeaders(),
      redirect: "follow",
    });
    if (res.status === 204) {
      return {} as T;
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || "Request failed");
    }
    return res.json();
  }

  async uploadFile<T>(path: string, file: File): Promise<T> {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("access_token");
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(this.buildUrl(path), {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || "Upload failed");
    }
    return res.json();
  }
}

export const api = new ApiClient(GATEWAY_URL);
export const identityApi = new ApiClient(IDENTITY_URL);
export const learningApi = new ApiClient(LEARNING_URL);

// Admin Management
export interface CreateAdminRequest {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  tenant_id: string;
  department?: string;
}

export interface CreateAdminResponse {
  success: boolean;
  message: string;
  admin_id: string;
  login_credentials: {
    email: string;
    password: string;
  };
}

export async function createAdminDirect(data: CreateAdminRequest): Promise<CreateAdminResponse> {
  return api.post<CreateAdminResponse>("/api/v1/superadmin/admins/create", data);
}

// Dashboard and Tenant Management
export interface DashboardStatsResponse {
    tenants: {
        total: number;
        active: number;
        suspended: number;
        pending: number;
    };
    users: {
        total: number;
        active: number;
        pending: number;
        inactive: number;
    };
}

export async function getTenantsPublic(page: number = 1, pageSize: number = 20, status?: string): Promise<TenantListResponse> {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (status) params.append("status", status);
    return api.get<TenantListResponse>(`/api/v1/tenants/public?${params}`);
}

export interface PlatformAlert {
  type: string;
  message: string;
  action_url?: string;
}

export interface PlatformAlertsResponse {
  alerts: PlatformAlert[];
}

export interface PlatformAuditLog {
  id: string;
  action: string;
  actor_id?: string | null;
  actor_email?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface PlatformAuditLogListResponse {
  items: PlatformAuditLog[];
  total: number;
  page: number;
  page_size: number;
}

export interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  primary_color?: string;
  email_domain?: string;
  entra_client_id?: string;
  entra_tenant_id?: string;
  entra_redirect_uris?: string[];
  seat_limit?: number;
  status: 'active' | 'suspended' | 'pending';
  created_at: string;
  updated_at: string;
  user_count?: number;
  admin_assigned?: boolean;
  entra_configured?: boolean;
  entra_id_config?: boolean;
}

export interface UpdateTenantRequest {
  name?: string;
  email_domain?: string;
  logo_url?: string;
  primary_color?: string;
  entra_client_id?: string;
  entra_tenant_id?: string;
  entra_redirect_uris?: string[];
  seat_limit?: number;
}

export interface TenantListResponse {
  tenants: TenantResponse[];
  total: number;
  page: number;
  page_size: number;
}

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  return api.get<DashboardStatsResponse>("/api/v1/superadmin/dashboard/stats");
}

export async function getTenants(page: number = 1, pageSize: number = 20, status?: string): Promise<TenantListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (status) params.append("status", status);
  return api.get<TenantListResponse>(`/api/v1/superadmin/tenants?${params}`);
}

export async function getTenant(id: string): Promise<TenantResponse> {
  return api.get<TenantResponse>(`/api/v1/superadmin/tenants/${id}`);
}

export async function getPlatformAlerts(): Promise<PlatformAlertsResponse> {
  return api.get<PlatformAlertsResponse>("/api/v1/superadmin/dashboard/alerts");
}

export async function getPlatformAuditLogs(
  page: number = 1,
  pageSize: number = 20,
  action?: string,
  targetType?: string
): Promise<PlatformAuditLogListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (action) {
    params.set("action", action);
  }
  if (targetType) {
    params.set("target_type", targetType);
  }
  return api.get<PlatformAuditLogListResponse>(
    `/api/v1/superadmin/audit-log?${params.toString()}`
  );
}

export async function exportPlatformAuditLogs(
  action?: string,
  targetType?: string
): Promise<Blob> {
  const params = new URLSearchParams();
  if (action) {
    params.set("action", action);
  }
  if (targetType) {
    params.set("target_type", targetType);
  }
  const query = params.toString();
  return api.getBlob(
    `/api/v1/superadmin/audit-log/export${query ? `?${query}` : ""}`
  );
}

// Additional tenant management functions
export interface UserListResponse {
  users: UserResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  tenant_id?: string;
  department?: string | null;
}

export async function getUsers(page: number = 1, pageSize: number = 20): Promise<UserListResponse> {
  // Mock data for testing
  const mockUsers: UserResponse[] = [
    {
      id: "user-1",
      email: "john.doe@3s.com",
      first_name: "John",
      last_name: "Doe",
      role: "TeamMember",
      status: "active",
      tenant_id: "tenant-1",
    },
    {
      id: "user-2",
      email: "jane.smith@advancia.com",
      first_name: "Jane",
      last_name: "Smith",
      role: "TeamMember",
      status: "active",
      tenant_id: "tenant-2",
    },
    {
      id: "user-3",
      email: "bob.wilson@smartup.com",
      first_name: "Bob",
      last_name: "Wilson",
      role: "Admin",
      status: "active",
      tenant_id: "tenant-3",
    },
  ];

  return {
    users: mockUsers,
    total: mockUsers.length,
    page: page,
    page_size: pageSize,
  };
}

export interface TenantSetupProgress {
  tenant_id: string;
  completion_percentage: number;
  steps: Array<{
    key: string;
    label: string;
    status: string;
    value?: string | null;
  }>;
}

export interface TenantAdminResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  tenant_id?: string;
  tenant_name?: string;
  department?: string;
  created_at?: string;
  last_login?: string;
}

export interface TestEntraConnectionResponse {
  success: boolean;
  message: string;
}

export async function getTenantProgress(id: string): Promise<TenantSetupProgress> {
  return api.get<TenantSetupProgress>(`/api/v1/superadmin/tenants/${id}/progress`);
}

export async function updateTenant(id: string, data: any): Promise<TenantResponse> {
  return api.put<TenantResponse>(`/api/v1/superadmin/tenants/${id}`, data);
}

export async function testEntraConnection(id: string): Promise<TestEntraConnectionResponse> {
  return api.post<TestEntraConnectionResponse>(`/api/v1/superadmin/tenants/${id}/test-entra`, {});
}

export async function getTenantAdmin(tenantId: string): Promise<TenantAdminResponse | null> {
  try {
    const response = await api.get<{ admins: TenantAdminResponse[]; total: number; page: number; page_size: number }>(`/api/v1/superadmin/admins?page=1&page_size=1&tenantId=${tenantId}`);
    return response.admins.length > 0 ? response.admins[0] : null;
  } catch (error) {
    // If the endpoint doesn't exist or fails, return null
    return null;
  }
}

export async function unassignTenantAdmin(adminId: string): Promise<void> {
  return api.post(`/api/v1/superadmin/admins/${adminId}/unassign`, {});
}

// Additional admin and tenant management functions
export interface TenantAdminListResponse {
  admins: TenantAdminResponse[];
  total: number;
  page: number;
  page_size: number;
}

export async function getTenantAdmins(page: number = 1, pageSize: number = 20, tenantId?: string): Promise<TenantAdminListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (tenantId) params.append("tenantId", tenantId);
  return api.get<TenantAdminListResponse>(`/api/v1/superadmin/admins?${params}`);
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
  email_domain?: string;
  logo_url?: string;
  entra_client_id?: string;
  entra_tenant_id?: string;
  seat_limit?: number;
}

export async function getPlatformUsers(page: number = 1, pageSize: number = 100): Promise<UserListResponse> {
  return api.get<UserListResponse>(`/api/v1/identity/users/?page=${page}&page_size=${pageSize}`);
}

export interface CreatePlatformUserRequest {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  department?: string;
  status?: string;
  tenant_id?: string;
  password?: string;
}

export async function createPlatformUser(data: CreatePlatformUserRequest): Promise<UserResponse> {
  return api.post<UserResponse>("/api/v1/identity/users/", data);
}

export interface UpdatePlatformUserRequest {
  first_name?: string;
  last_name?: string;
  role?: string;
  department?: string;
  status?: string;
}

export async function updatePlatformUser(userId: string, data: UpdatePlatformUserRequest): Promise<UserResponse> {
  return api.put<UserResponse>(`/api/v1/identity/users/${userId}`, data);
}

export async function deletePlatformUser(userId: string): Promise<void> {
  return api.delete(`/api/v1/identity/users/${userId}`);
}

export interface InviteAdminRequest {
  first_name: string;
  last_name: string;
  email: string;
  tenant_id: string;
}

export async function createTenant(data: CreateTenantRequest): Promise<TenantResponse> {
  return api.post<TenantResponse>("/api/v1/superadmin/tenants", data);
}

export async function updateTenantStatus(id: string, status: string): Promise<TenantResponse> {
  return api.put<TenantResponse>(`/api/v1/superadmin/tenants/${id}/status`, { status });
}

export async function deleteTenant(id: string): Promise<void> {
  return api.delete(`/api/v1/superadmin/tenants/${id}`);
}

export async function inviteAdmin(data: InviteAdminRequest): Promise<any> {
  return api.post("/api/v1/superadmin/admins/invite", data);
}

export function getAvatarUrl(avatar: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("http")) return avatar;
  return `${IDENTITY_URL}/api/v1/identity/users/avatar/${avatar}`;
}

// Gamification
export interface BadgeResponse {
  badge_id: string;
  name: string;
  tier: string;
  icon: string;
  description: string;
  earned_at?: string | null;
}

export interface LevelInfoResponse {
  level: number;
  total_xp: number;
  current_level_xp: number;
  next_level_xp: number;
  xp_in_level: number;
  xp_needed: number;
  progress: number;
  tier: string;
}

export interface StreakResponse {
  current_streak: number;
  longest_streak: number;
  last_activity_date?: string | null;
  is_active_today: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  user_name: string;
  avatar?: string | null;
  total_xp: number;
  level: number;
  rank_change: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  type: string;
}

export interface UserRankResponse {
  rank: number;
  total_xp: number;
  level: number;
}

export interface XPHistoryTransaction {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
}

export interface XPHistoryResponse {
  transactions: XPHistoryTransaction[];
}

export interface EnrollmentResponse {
  id: string;
  user_id: string;
  course_id: string;
  enrolled_at: string;
  completed_at?: string | null;
  status: string;
}

export interface LearnerContextLessonSummary {
  lessonId: string;
  title: string;
  contentType: string;
  status: string;
  timeSpent: number;
  completedAt?: string | null;
}

export interface LearnerContextResponse {
  userId: string;
  courseId: string;
  courseTitle: string;
  enrollment: {
    status: string;
    enrolledAt?: string | null;
    completedAt?: string | null;
  };
  progressSummary: {
    totalLessons: number;
    completedLessons: number;
    inProgressLessons: number;
    notStartedLessons: number;
    progressPercent: number;
    timeSpentSeconds: number;
  };
  currentLesson?: LearnerContextLessonSummary | null;
  lastOpenedLesson?: LearnerContextLessonSummary | null;
  lastCompletedLesson?: LearnerContextLessonSummary | null;
  latestQuizAttempt?: {
    lessonId?: string | null;
    score: number;
    passed: boolean;
    completedAt: string;
    source: string;
  } | null;
  failedQuizzes: Array<{
    lessonId: string;
    lessonTitle: string;
    score: number;
    completedAt?: string | null;
    wrongAnswers: unknown[];
  }>;
  failedQuizCount: number;
  latestFailedQuizLessonId?: string | null;
  updatedAt?: string | null;
}

export interface UserProgressResponse {
  id: string;
  user_id: string;
  lesson_id: string;
  status: string;
  completed_at?: string | null;
  last_activity_at?: string | null;
  time_spent: number;
}

export interface CertificateResponse {
  id: string;
  certificate_number: string;
  user_id: string;
  course_id: string;
  enrollment_id: string;
  learner_name: string;
  course_title: string;
  course_version?: string | null;
  issuing_org?: string | null;
  grade?: string | null;
  score?: number | null;
  issued_at: string;
  expires_at?: string | null;
  content_hash: string;
  signature: string;
  signature_algorithm: string;
  pdf_url?: string | null;
  status: string;
  is_revoked: boolean;
  revoked_at?: string | null;
  revoked_reason?: string | null;
}

export interface CertificateListResponse {
  certificates: CertificateResponse[];
  total: number;
}

export interface CertificateVerifyResponse {
  status: "valid" | "invalid" | "revoked" | "expired";
  message: string;
  certificate_id?: string | null;
  full_name?: string | null;
  course_name?: string | null;
  completion_date?: string | null;
  grade?: string | null;
  score?: number | null;
  issued_at?: string | null;
  expires_at?: string | null;
  reason?: string | null;
  certificate?: CertificateResponse | null;
}

export interface GamificationProfileResponse {
  xp: { total: number };
  level: LevelInfoResponse;
  streak: StreakResponse;
  badges: {
    user: BadgeResponse[];
    all: Array<BadgeResponse & { unlocked: boolean }>;
  };
  rank: UserRankResponse | null;
}

export async function getUserXp(): Promise<{ total_xp: number }> {
  return api.get<{ total_xp: number }>("/api/v1/learning/gamification/xp");
}

export async function getXpHistory(
  limit: number = 100,
  offset: number = 0
): Promise<XPHistoryResponse> {
  return api.get<XPHistoryResponse>(
    `/api/v1/learning/gamification/xp/history?limit=${limit}&offset=${offset}`
  );
}

export async function getLevelInfo(): Promise<LevelInfoResponse> {
  return api.get<LevelInfoResponse>("/api/v1/learning/gamification/level");
}

export async function getStreak(): Promise<StreakResponse> {
  return api.get<StreakResponse>("/api/v1/learning/gamification/streak");
}

export async function recordActivity(): Promise<{
  current_streak: number;
  longest_streak: number;
  milestone?: number | null;
}> {
  return api.post("/api/v1/learning/gamification/streak/activity", {});
}

export async function getUserBadges(): Promise<{ badges: BadgeResponse[] }> {
  return api.get<{ badges: BadgeResponse[] }>("/api/v1/learning/gamification/badges");
}

export async function getBadgeDefinitions(): Promise<{ badges: BadgeResponse[] }> {
  return api.get<{ badges: BadgeResponse[] }>("/api/v1/learning/gamification/badges/definitions");
}

export async function getGamificationProfile(): Promise<GamificationProfileResponse> {
  return api.get<GamificationProfileResponse>("/api/v1/learning/gamification/profile");
}

export async function getLeaderboard(
  type: "global" | "weekly" | "monthly" | "team" = "global",
  options?: { teamId?: string; limit?: number; offset?: number }
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({ type });
  if (options?.teamId) params.set("team_id", options.teamId);
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.offset !== undefined) params.set("offset", String(options.offset));
  return api.get<LeaderboardResponse>(`/api/v1/learning/gamification/leaderboard?${params.toString()}`);
}

export async function getMyRank(): Promise<UserRankResponse> {
  return api.get<UserRankResponse>("/api/v1/learning/gamification/leaderboard/me");
}

export async function getEnrollments(userId?: string): Promise<EnrollmentResponse[]> {
  const params = new URLSearchParams();
  if (userId) {
    params.set("user_id", userId);
  }
  const query = params.toString();
  return api.get<EnrollmentResponse[]>(
    `/api/v1/learning/enrollments/${query ? `?${query}` : ""}`
  );
}

export async function getCourseLearnerContext(
  courseId: string,
  userId: string
): Promise<LearnerContextResponse> {
  return api.get<LearnerContextResponse>(
    `/api/v1/learning/courses/${courseId}/learner-context/${userId}`
  );
}

export async function getCertificates(userId?: string): Promise<CertificateListResponse> {
  const params = new URLSearchParams();
  if (userId) {
    params.set("user_id", userId);
  }
  const query = params.toString();
  return api.get<CertificateListResponse>(
    `/api/v1/learning/certificates/${query ? `?${query}` : ""}`
  );
}

export async function getUserProgress(
  userId: string,
  courseId?: string
): Promise<UserProgressResponse[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (courseId) {
    params.set("course_id", courseId);
  }
  return api.get<UserProgressResponse[]>(
    `/api/v1/learning/progress/?${params.toString()}`
  );
}

// Bookmarks
export interface Bookmark {
  id: string;
  user_id: string;
  course_id?: string;
  lesson_id?: string;
  created_at: string;
}

export async function getCourseBookmarks(): Promise<Bookmark[]> {
  try {
    return await api.get<Bookmark[]>("/api/v1/learning/bookmarks/courses");
  } catch {
    return [];
  }
}

export async function getLessonBookmarks(): Promise<Bookmark[]> {
  try {
    return await api.get<Bookmark[]>("/api/v1/learning/bookmarks/lessons");
  } catch {
    return [];
  }
}

export async function createBookmark(data: { course_id?: string; lesson_id?: string }): Promise<Bookmark> {
  return api.post<Bookmark>("/api/v1/learning/bookmarks", data);
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  return api.delete(`/api/v1/learning/bookmarks/${bookmarkId}`);
}

export async function checkCourseBookmarked(courseId: string): Promise<boolean> {
  try {
    return await api.get<boolean>(`/api/v1/learning/bookmarks/check/course/${courseId}`);
  } catch {
    return false;
  }
}

export async function checkLessonBookmarked(lessonId: string): Promise<boolean> {
  try {
    return await api.get<boolean>(`/api/v1/learning/bookmarks/check/lesson/${lessonId}`);
  } catch {
    return false;
  }
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  manager_id?: string;
  tenant_id?: string;
  created_at: string;
  member_count?: number;
  memberships?: TeamMember[];
}

export interface TeamMember {
  user_id: string;
  user_name: string;
  role: string;
  joined_at: string;
  avatar?: string;
}

export interface TeamProgress {
  team_id: string;
  team_name: string;
  total_members: number;
  members: TeamMemberProgress[];
}

export interface TeamAvailableUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  role: string;
  department?: string | null;
  status: string;
}

export interface TeamActivityItem {
  type: string;
  timestamp: string;
  user_id: string;
  user_name: string;
  message: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string | null;
  target_date?: string | null;
  target_count: number;
  xp_reward: number;
  progress: number;
  status: string;
  completion_rate: number;
  created_at: string;
  updated_at: string;
}

export interface TeamGoal extends Goal {
  team_id: string;
  team_name: string;
  total_members: number;
  completed_members: number;
}

export interface SkillNode {
  id: string;
  name: string;
  category: string;
  description?: string | null;
}

export interface SkillEdge {
  id: string;
  from_skill_id: string;
  to_skill_id: string;
  edge_type: string;
}

export interface SkillGraphResponse {
  skills: SkillNode[];
  edges: SkillEdge[];
}

export interface SkillGapItem {
  skill_name: string;
  target_skill: string;
  gap_type: string;
  severity: string;
  recommended_courses: Array<{
    id: string;
    title: string;
    category: string;
    difficulty: string;
    is_published: boolean;
  }>;
}

export interface SkillGapResponse {
  role: string;
  target_skills: string[];
  mastered_skills: string[];
  gaps: SkillGapItem[];
}

export interface Course {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  difficulty: string;
  duration: number;
  xp_reward: number;
  is_published: boolean;
  tenant_id?: string | null;
}

export interface CourseListResponse {
  items: Course[];
  total: number;
  page: number;
  page_size: number;
}

export interface ModuleResponse {
  id: string;
  course_id: string;
  title: string;
  description?: string | null;
  order: number;
  created_at: string;
}

export interface LessonResponse {
  id: string;
  module_id: string;
  title: string;
  content?: string | null;
  video_url?: string | null;
  content_type: string;
  duration: number;
  order: number;
  assessment_id?: string | null;
  created_at: string;
}

export interface AssessmentResponse {
  id: string;
  module_id: string;
  title: string;
  passing_score: number;
  time_limit?: number | null;
  created_at: string;
}

export interface AssessmentQuestionResponse {
  id: string;
  assessment_id: string;
  text: string;
  type: string;
  options: string[];
  points: number;
  order: number;
}

export interface AssessmentAttemptQuestionReview {
  id: string;
  assessment_id: string;
  text: string;
  type: string;
  options: string[];
  points: number;
  order: number;
  user_answer?: string | null;
  is_correct?: boolean | null;
}

export interface AssessmentAttemptResult {
  id: string;
  assessment_id: string;
  title: string;
  score: number;
  passed: boolean;
  total_points: number;
  earned_points: number;
  started_at: string;
  completed_at: string;
  questions: AssessmentAttemptQuestionReview[];
}

export interface CourseDetailModule extends ModuleResponse {
  lessons: LessonResponse[];
}

export interface CourseDetailResponse extends Course {
  thumbnail?: string | null;
  rating?: number | null;
  author_id?: string | null;
  tenant_id?: string | null;
  created_at?: string;
  updated_at?: string;
  modules: CourseDetailModule[];
}

export interface ContentUploadResponse {
  id: string;
  object_name: string;
  bucket: string;
  content_type: string;
  filename: string;
  file_size: number;
  mime_type: string;
  url: string;
  course_id?: string | null;
  module_id?: string | null;
  tenant_id?: string | null;
  status: string;
  created_at: string;
}

export interface SyncStatusResponse {
  last_sync?: string | null;
  last_sync_status?: string | null;
  total_synced_today: number;
}

export interface TriggerManualSyncResponse {
  status: string;
  message: string;
  tenant_id?: string;
  total_users?: number;
  tenants?: Array<{
    id: string;
    name: string;
  }>;
}

export interface TeamMemberProgress {
  user_id: string;
  user_name: string;
  avatar?: string;
  role: string;
  courses_assigned: number;
  courses_completed: number;
  courses_in_progress: number;
  completion_rate: number;
}

export async function getTeams(): Promise<Team[]> {
  return api.get<Team[]>("/api/v1/learning/teams");
}

export async function getTeam(teamId: string): Promise<Team> {
  return api.get<Team>(`/api/v1/learning/teams/${teamId}`);
}

export async function createTeam(data: { name: string; description?: string }): Promise<Team> {
  return api.post<Team>("/api/v1/learning/teams", data);
}

export async function updateTeam(teamId: string, data: { name?: string; description?: string }): Promise<Team> {
  return api.put<Team>(`/api/v1/learning/teams/${teamId}`, data);
}

export async function deleteTeam(teamId: string): Promise<void> {
  return api.delete(`/api/v1/learning/teams/${teamId}`);
}

export async function addTeamMember(teamId: string, data: { user_id: string; role?: string }): Promise<void> {
  return api.post<void>(`/api/v1/learning/teams/${teamId}/members`, data);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  return api.delete(`/api/v1/learning/teams/${teamId}/members/${userId}`);
}

export async function assignCourseToTeam(
  teamId: string,
  data: { course_id: string; deadline?: string; is_mandatory?: boolean }
): Promise<{ enrolled_count: number; failed_count: number }> {
  return api.post(`/api/v1/learning/teams/${teamId}/courses`, data);
}

export async function getTeamProgress(teamId: string): Promise<TeamProgress> {
  return api.get<TeamProgress>(`/api/v1/learning/teams/${teamId}/progress`);
}

export async function getTeamAvailableUsers(): Promise<TeamAvailableUser[]> {
  return api.get<TeamAvailableUser[]>("/api/v1/learning/teams/available-users");
}

export async function getTeamActivity(teamId: string): Promise<TeamActivityItem[]> {
  return api.get<TeamActivityItem[]>(`/api/v1/learning/teams/${teamId}/activity`);
}

export async function getSyncStatus(): Promise<SyncStatusResponse> {
  return api.get<SyncStatusResponse>("/api/v1/sync/status");
}

export async function triggerManualSync(): Promise<TriggerManualSyncResponse> {
  return api.post<TriggerManualSyncResponse>("/api/v1/sync/trigger", {});
}

export async function getGoals(status?: string): Promise<Goal[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return api.get<Goal[]>(`/api/v1/learning/goals${query}`);
}

export async function createGoal(data: {
  title: string;
  description?: string | null;
  target_date?: string | null;
  target_count?: number;
  xp_reward?: number;
  progress?: number;
}): Promise<Goal> {
  return api.post<Goal>("/api/v1/learning/goals", data);
}

export async function updateGoal(
  goalId: string,
  data: Partial<Pick<Goal, "title" | "description" | "target_date" | "target_count" | "xp_reward" | "progress" | "status">>
): Promise<Goal> {
  return api.put<Goal>(`/api/v1/learning/goals/${goalId}`, data);
}

export async function deleteGoal(goalId: string): Promise<void> {
  return api.delete(`/api/v1/learning/goals/${goalId}`);
}

export async function getTeamGoals(teamId?: string): Promise<TeamGoal[]> {
  const query = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
  return api.get<TeamGoal[]>(`/api/v1/learning/goals/team${query}`);
}

export async function createTeamGoal(data: {
  team_id: string;
  title: string;
  description?: string | null;
  target_date?: string | null;
  target_count?: number;
  xp_reward?: number;
  progress?: number;
}): Promise<TeamGoal> {
  return api.post<TeamGoal>("/api/v1/learning/goals/team", data);
}

export async function updateTeamGoal(
  goalId: string,
  data: Partial<Pick<TeamGoal, "title" | "description" | "target_date" | "target_count" | "xp_reward" | "progress" | "status">>
): Promise<TeamGoal> {
  return api.put<TeamGoal>(`/api/v1/learning/goals/team/${goalId}`, data);
}

export async function getSkillGraph(): Promise<SkillGraphResponse> {
  return api.get<SkillGraphResponse>("/api/v1/learning/skill-gap/graph");
}

export async function getSkillGapAnalysis(): Promise<SkillGapResponse> {
  return api.get<SkillGapResponse>("/api/v1/learning/skill-gap/gaps");
}

export async function getCourses(params?: {
  page?: number;
  page_size?: number;
  is_published?: boolean;
  search?: string;
}): Promise<CourseListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));
  if (params?.is_published !== undefined) searchParams.set("is_published", String(params.is_published));
  if (params?.search) searchParams.set("search", params.search);
  const query = searchParams.toString();
  return api.get<CourseListResponse>(`/api/v1/learning/courses/${query ? `?${query}` : ""}`);
}

export async function createCourse(data: {
  title: string;
  description?: string | null;
  category: string;
  difficulty: string;
  duration: number;
  xp_reward: number;
  is_published?: boolean;
  tenant_id?: string | null;
}): Promise<Course> {
  return api.post<Course>("/api/v1/learning/courses/", data);
}

export async function getCourseById(courseId: string): Promise<CourseDetailResponse> {
  return api.get<CourseDetailResponse>(`/api/v1/learning/courses/${courseId}`);
}

export async function updateCourseById(
  courseId: string,
  data: {
    title?: string;
    description?: string | null;
    category?: string;
    difficulty?: string;
    duration?: number;
    xp_reward?: number;
    is_published?: boolean;
  }
): Promise<Course> {
  return api.put<Course>(`/api/v1/learning/courses/${courseId}`, data);
}

export async function toggleCoursePublish(courseId: string): Promise<{ id: string; is_published: boolean; updated_at: string }> {
  return api.patch(`/api/v1/learning/courses/${courseId}/publish`);
}

export async function deleteCourseById(courseId: string): Promise<void> {
  return api.delete(`/api/course-management/courses/${courseId}`);
}

export async function createCourseModule(
  courseId: string,
  data: { title: string; description?: string | null; order: number }
): Promise<ModuleResponse> {
  return api.post<ModuleResponse>(`/api/v1/learning/modules/course/${courseId}`, data);
}

export async function updateCourseModule(
  moduleId: string,
  data: { title?: string; description?: string | null; order?: number }
): Promise<ModuleResponse> {
  return api.put<ModuleResponse>(`/api/v1/learning/modules/${moduleId}`, data);
}

export async function createModuleLesson(
  moduleId: string,
  data: {
    title: string;
    content?: string | null;
    video_url?: string | null;
    content_type: string;
    duration: number;
    order: number;
    assessment_id?: string | null;
  }
): Promise<LessonResponse> {
  return api.post<LessonResponse>(`/api/v1/learning/lessons/module/${moduleId}`, data);
}

export async function updateModuleLesson(
  lessonId: string,
  data: {
    title?: string;
    content?: string | null;
    video_url?: string | null;
    content_type?: string;
    duration?: number;
    order?: number;
    assessment_id?: string | null;
  }
): Promise<LessonResponse> {
  return api.put<LessonResponse>(`/api/v1/learning/lessons/${lessonId}`, data);
}

export async function createCourseAssessment(
  courseId: string,
  data: {
    module_id: string;
    title: string;
    passing_score: number;
    time_limit?: number | null;
  }
): Promise<AssessmentResponse> {
  return api.post<AssessmentResponse>(`/api/v1/learning/courses/${courseId}/assessments`, data);
}

export async function createAssessmentQuestion(
  courseId: string,
  assessmentId: string,
  data: {
    text: string;
    type: string;
    options: string[];
    correct_answer: string;
    points: number;
    order: number;
  }
): Promise<AssessmentQuestionResponse> {
  return api.post<AssessmentQuestionResponse>(
    `/api/v1/learning/courses/${courseId}/assessments/${assessmentId}/questions`,
    data
  );
}

export async function uploadCourseContent(
  file: File,
  options?: { courseId?: string; moduleId?: string }
): Promise<ContentUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.courseId) {
    formData.append("course_id", options.courseId);
  }
  if (options?.moduleId) {
    formData.append("module_id", options.moduleId);
  }
  if (isBrowser()) {
    const token = getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(`${LEARNING_URL}/api/v1/content/upload`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || "Request failed");
    }
    return response.json();
  }
  return api.postForm<ContentUploadResponse>("/api/v1/learning/content/upload", formData);
}

export async function retainTraditionalCourseMemoryPdf(
  courseId: string,
  file: File,
  tenantId?: string | null,
): Promise<{ success: boolean }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("courseId", courseId);
  if (tenantId) {
    formData.append("tenantId", tenantId);
  }
  return api.postForm<{ success: boolean }>("/api/course-memory-agent/course-source-pdf", formData);
}

export async function getAICourseDraftByPlatformCourseId(
  courseId: string,
  title?: string | null,
): Promise<{
  success: boolean;
  draftId: string;
  record: {
    draftId: string;
    status: string;
    platformCourseId: string | null;
  };
}> {
  const params = new URLSearchParams();
  if (title) {
    params.set("title", title);
  }
  const query = params.toString();
  return api.get(`/api/ai-course-builder/platform-course/${courseId}${query ? `?${query}` : ""}`);
}

export interface TenantStats {
  id: string;
  name: string;
  status: string;
  total_users: number;
  active_users: number;
  pending_users: number;
  admin_count: number;
  seat_limit: number;
  seat_usage_percent: number;
  published_courses: number;
  enrollment_count: number;
  completed_enrollments: number;
  active_learners: number;
  completion_rate: number;
  entra_configured: boolean;
}

export interface AnalyticsResponse {
  period: string;
  platform_overview: {
    total_tenants: number;
    active_tenants: number;
    suspended_tenants: number;
    pending_tenants: number;
    total_users: number;
    active_users: number;
    new_users_in_period: number;
    published_courses: number;
  };
  tenant_stats: TenantStats[];
  role_distribution: Record<string, number>;
  status_distribution: Record<string, number>;
  learning_metrics: {
    total_enrollments: number;
    active_learners: number;
    completed_enrollments: number;
    completion_rate: number;
  };
  governance_metrics: {
    tenants_with_admin: number;
    tenants_without_admin: number;
    tenants_with_entra: number;
    tenants_without_entra: number;
    seat_limit_reached: number;
    near_capacity_tenants: number;
    unlimited_seat_tenants: number;
  };
}

export async function getCrossTenantAnalytics(period: string = "all"): Promise<AnalyticsResponse> {
  const params = new URLSearchParams({ period });
  return api.get<AnalyticsResponse>(`/api/v1/superadmin/dashboard/analytics?${params.toString()}`);
}

export interface RoleMapping {
  id: string;
  azure_role: string;
  platform_role: string;
  department?: string | null;
  is_active: boolean;
  scope?: string;
}

export interface PlatformSettings {
  general: {
    platform_name: string;
    group_website?: string | null;
    platform_language: string;
    default_timezone: string;
    support_email?: string | null;
  };
  security: {
    mfa_required_for_superadmin: boolean;
    mfa_required_for_tenant_admins: boolean;
    security_alerts: {
      failed_login_spikes: boolean;
      admin_account_changes: boolean;
      password_reset_events: boolean;
      tenant_status_changes: boolean;
    };
  };
  notifications: {
    email_templates?: Record<string, boolean>;
    smtp_config?: Record<string, unknown>;
  };
  ai: {
    groq_api_key?: string | null;
    demo_mode: boolean;
    agent_toggles?: Record<string, boolean>;
  };
  superadmin_onboarded?: boolean;
  setup_completed?: boolean;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return api.get<PlatformSettings>("/api/v1/superadmin/settings");
}

export async function updateGeneralSettings(data: PlatformSettings["general"]): Promise<{ success: boolean }> {
  return api.put<{ success: boolean }>("/api/v1/superadmin/settings/general", data);
}

export async function updateSecuritySettings(data: PlatformSettings["security"]): Promise<{ success: boolean }> {
  return api.put<{ success: boolean }>("/api/v1/superadmin/settings/security", data);
}

export async function updateNotificationSettings(data: {
  email_templates: Record<string, boolean>;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_from_name?: string;
}): Promise<{ success: boolean }> {
  return api.put<{ success: boolean }>("/api/v1/superadmin/settings/notifications", data);
}

export async function updateAISettings(data: {
  groq_api_key?: string;
  demo_mode?: boolean;
  agent_toggles?: Record<string, boolean>;
}): Promise<{ success: boolean }> {
  return api.put<{ success: boolean }>("/api/v1/superadmin/settings/ai", data);
}

export async function testEmail(): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>("/api/v1/superadmin/settings/test-email", {});
}

export async function resetPlatform(): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>("/api/v1/superadmin/settings/reset", {});
}

export async function getPlatformRoleMappings(): Promise<RoleMapping[]> {
  return api.get<RoleMapping[]>("/api/v1/superadmin/role-mappings");
}

export async function createPlatformRoleMapping(data: {
  azure_role: string;
  platform_role: string;
  department?: string;
}): Promise<RoleMapping> {
  return api.post<RoleMapping>("/api/v1/superadmin/role-mappings", data);
}

export async function updatePlatformRoleMapping(
  id: string,
  data: Partial<Pick<RoleMapping, "azure_role" | "platform_role" | "department" | "is_active">>
): Promise<RoleMapping> {
  return api.put<RoleMapping>(`/api/v1/superadmin/role-mappings/${id}`, data);
}

export async function deletePlatformRoleMapping(id: string): Promise<void> {
  return api.delete(`/api/v1/superadmin/role-mappings/${id}`);
}
