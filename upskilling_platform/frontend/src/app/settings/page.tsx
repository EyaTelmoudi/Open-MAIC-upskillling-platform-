"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { getAvatarUrl } from "@/app/lib/api";
import { AppShell } from "@/app/components/layout/AppShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { Textarea } from "@/app/components/ui/Textarea";
import { Switch } from "@/app/components/ui/Switch";
import { Badge } from "@/app/components/ui/Badge";
import {
  User,
  Bell,
  Settings,
  Building2,
  Server,
  Lock,
  Mail,
  Activity,
  Award,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Crown,
  Briefcase,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Database,
  Trash2,
  Users,
  Zap,
  Globe,
  Upload,
  Camera,
  X,
  Clock,
} from "lucide-react";

/* ──────────────────────────────────────────────────
   Toggle Card
   ────────────────────────────────────────────────── */
function ToggleCard({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-4 shadow-sm transition-colors hover:border-primary/20 hover:bg-accent/20">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/* ──────────────────────────────────────────────────
   Collapsible Section
   ────────────────────────────────────────────────── */
function Section({
  icon: Icon,
  iconBg,
  title,
  description,
  defaultExpanded = false,
  danger = false,
  children,
}: {
  icon: React.ElementType;
  iconBg: string;
  title: string;
  description: string;
  defaultExpanded?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`overflow-hidden rounded-3xl border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition-colors ${danger ? "border-destructive/50" : "border-border/90"}`}>
      <button
        onClick={() => setExpanded((p) => !p)}
        className={`flex w-full items-center justify-between p-5 text-left transition-colors sm:p-6 ${danger ? "hover:bg-destructive/5" : "hover:bg-accent/40"}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm" style={{ backgroundColor: iconBg }}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className={`text-base font-semibold ${danger ? "text-destructive" : "text-text-primary"}`}>{title}</h3>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background text-text-secondary">
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>
      {expanded && <div className="border-t border-border/80 p-5 sm:p-6">{children}</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────
   Data
   ────────────────────────────────────────────────── */
const admins = [
  { name: "Sarah Chen", email: "sarah.chen@skillforge.io", department: "Engineering", role: "Super Admin" },
  { name: "Michael Roberts", email: "michael.roberts@skillforge.io", department: "Product", role: "Super Admin" },
  { name: "Aya Hassan", email: "aya.hassan@skillforge.io", department: "Design", role: "Dept Admin" },
  { name: "James Kim", email: "james.kim@skillforge.io", department: "Marketing", role: "Dept Admin" },
];

const permissions = [
  { name: "Manage all users", super: true, dept: false, trainer: false },
  { name: "Manage dept users only", super: true, dept: true, trainer: false },
  { name: "Create & edit courses", super: true, dept: true, trainer: true },
  { name: "View analytics", super: true, dept: true, trainer: false },
  { name: "Change platform settings", super: true, dept: false, trainer: false },
];

const rabbitMQEvents = [
  { event: "user.logged_in", description: "Triggered when a user successfully logs in" },
  { event: "user.created", description: "Triggered when a new user account is created" },
  { event: "course.assigned", description: "Triggered when a course is assigned to a user" },
  { event: "course.completed", description: "Triggered when a user completes a course" },
  { event: "certificate.issued", description: "Triggered when a certificate is generated" },
  { event: "user.deactivated", description: "Triggered when a user account is deactivated" },
];

const navItems = [
  { key: "profile", label: "Profile", description: "Identity, bio, skills, and learning habits", icon: User },
  { key: "notifications", label: "Notifications", description: "Alerts and delivery preferences", icon: Bell },
  { key: "preferences", label: "Preferences", description: "Language, timezone, and UI behavior", icon: Settings },
  { key: "enterprise", label: "Enterprise", description: "Organization-wide learning settings", icon: Building2, adminManager: true },
  { key: "platform", label: "Platform Admin", description: "Advanced administration and platform controls", icon: Server, adminOnly: true },
];

const THEME_PREF_VERSION = 2;

type SavedPreferences = {
  language: string;
  timezone: string;
  themeVersion?: number;
};

function getDefaultPreferences(): SavedPreferences {
  return {
    language: "English",
    timezone: "UTC+01:00",
    themeVersion: THEME_PREF_VERSION,
  };
}

function loadSavedPreferences(): SavedPreferences {
  if (typeof window === "undefined") {
    return getDefaultPreferences();
  }

  const raw = window.localStorage.getItem("sf_preferences");
  if (!raw) {
    return getDefaultPreferences();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SavedPreferences>;
    const defaults = getDefaultPreferences();

    const migrated: SavedPreferences = {
      language: parsed.language ?? defaults.language,
      timezone: parsed.timezone ?? defaults.timezone,
      themeVersion: THEME_PREF_VERSION,
    };

    if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
      window.localStorage.setItem("sf_preferences", JSON.stringify(migrated));
    }

    return migrated;
  } catch {
    window.localStorage.removeItem("sf_preferences");
    return getDefaultPreferences();
  }
}

/* ──────────────────────────────────────────────────
   Main Settings Page
   ────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { user, updateProfile, uploadAvatar } = useAuth();
  const isAdmin = user?.role === "Admin";
  const isSuperAdmin = user?.role === "SuperAdmin";
  const isManager = user?.role === "Manager";
  const hideNotificationsTab = isAdmin || isSuperAdmin;
  const hidePlatformAdminTab = isAdmin || isSuperAdmin;
  const hideEnterpriseTab = isAdmin || isSuperAdmin;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  /* Profile */
  const [profileForm, setProfileForm] = useState({
    fullName: `${user?.first_name || ""} ${user?.last_name || ""}`.trim(),
    jobTitle: user?.department || "",
    email: user?.email || "",
    bio: user?.bio || "",
    skills: Array.isArray(user?.skills) ? user.skills : [],
  });
  const [skillInput, setSkillInput] = useState("");
  const [learningPace, setLearningPace] = useState("Moderate - 3–5 lessons per week");
  const [learningTimes, setLearningTimes] = useState("Weekday mornings, Weekend afternoons");
  const [showPaceModal, setShowPaceModal] = useState(false);
  const [showTimesModal, setShowTimesModal] = useState(false);
  const [tempPace, setTempPace] = useState(learningPace);
  const [tempTimes, setTempTimes] = useState<string[]>(["Weekday mornings", "Weekend afternoons"]);

  useEffect(() => {
    setProfileForm({
      fullName: `${user?.first_name || ""} ${user?.last_name || ""}`.trim(),
      jobTitle: user?.department || "",
      email: user?.email || "",
      bio: user?.bio || "",
      skills: Array.isArray(user?.skills) ? user.skills : [],
    });
  }, [user?.bio, user?.department, user?.email, user?.first_name, user?.last_name, user?.skills]);

  /* Notifications — load from localStorage */
  const [notificationSettings, setNotificationSettings] = useState<{
    welcomeEmail: boolean;
    courseAssigned: boolean;
    deadlineReminder: boolean;
    courseCompletion: boolean;
    certificateIssued: boolean;
    inactivityAlert: boolean;
  }>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sf_notifications");
      if (saved) return JSON.parse(saved);
    }
    return {
      welcomeEmail: true,
      courseAssigned: true,
      deadlineReminder: true,
      courseCompletion: true,
      certificateIssued: true,
      inactivityAlert: false,
    };
  });

  /* Preferences — load from localStorage */
  const [preferences, setPreferences] = useState<{
    language: string;
    timezone: string;
  }>(() => loadSavedPreferences());

  useEffect(() => {
    if (!user?.timezone) {
      return;
    }

    setPreferences((current) =>
      current.timezone === user.timezone ? current : { ...current, timezone: user.timezone || current.timezone }
    );
  }, [user?.timezone]);

  /* Platform Admin */
  const [platformData, setPlatformData] = useState({
    platformName: "SkillForge",
    companyName: "TechCorp",
    supportEmail: "training@skillforge.io",
    defaultLanguage: "English",
    welcomeMessage: "Welcome to SkillForge. Log in with your company account to start your learning journey.",
  });
  const [authData, setAuthData] = useState({
    azureActive: true,
    autoProvision: true,
    restrictDomain: true,
    requireStrongPassword: true,
    sessionTimeout: true,
    sessionDuration: 60,
  });
  const [brokerConnection, setBrokerConnection] = useState("amqp://rabbitmq.internal:5672");

  /* Platform Admin — Notification sender config */
  const [platformNotifSettings, setPlatformNotifSettings] = useState({
    senderName: "SkillForge Learning Team",
    senderEmail: "no-reply@skillforge.io",
  });
  const [certificateSettings, setCertificateSettings] = useState({
    organisationName: "SkillForge — Learning & Development Division",
    signatoryName: "Dr. Emily Watson, Chief Learning Officer",
    validityMonths: 12,
    autoGenerate: true,
    emailPDF: true,
    notifyAdmin: true,
  });

  /* Handlers */
  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !profileForm.skills.includes(trimmed)) {
      setProfileForm((p) => ({ ...p, skills: [...p.skills, trimmed] }));
    }
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    setProfileForm((p) => ({ ...p, skills: p.skills.filter((s) => s !== skill) }));
  };

  /* ── Save Notifications ── */
  const handleSaveNotifications = useCallback(() => {
    localStorage.setItem("sf_notifications", JSON.stringify(notificationSettings));
    setSuccess("Notification preferences saved!");
    setTimeout(() => setSuccess(""), 3000);
  }, [notificationSettings]);

  /* ── Save Preferences ── */
  const handleSavePreferences = useCallback(() => {
    const persist = async () => {
      localStorage.setItem(
        "sf_preferences",
        JSON.stringify({
          ...preferences,
          themeVersion: THEME_PREF_VERSION,
        })
      );

      if (user?.timezone !== preferences.timezone) {
        await updateProfile({ timezone: preferences.timezone });
      }

      setSuccess("App preferences saved!");
      setTimeout(() => setSuccess(""), 3000);
    };

    void persist().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to save app preferences");
    });
  }, [preferences, updateProfile, user?.timezone]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }
    setError("");
    setIsUploading(true);
    try {
      await uploadAvatar(file);
      setSuccess("Profile picture updated!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async () => {
    setError("");
    setSuccess("");
    setIsSaving(true);
    try {
      const nameParts = profileForm.fullName.trim().split(/\s+/);
      await updateProfile({
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        department: profileForm.jobTitle || null,
        bio: profileForm.bio || null,
        skills: profileForm.skills,
      });
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredNavItems = navItems.filter((item) => {
    if (item.key === "notifications" && hideNotificationsTab) return false;
    if (item.key === "platform" && hidePlatformAdminTab) return false;
    if (item.key === "enterprise" && hideEnterpriseTab) return false;
    if (item.adminOnly) return isAdmin;
    if (item.adminManager) return isAdmin || isManager;
    return true;
  });
  useEffect(() => {
    if (
      (hideNotificationsTab && activeTab === "notifications") ||
      (hidePlatformAdminTab && activeTab === "platform") ||
      (hideEnterpriseTab && activeTab === "enterprise")
    ) {
      setActiveTab("profile");
    }
  }, [activeTab, hideEnterpriseTab, hideNotificationsTab, hidePlatformAdminTab]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1320px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="mb-6 overflow-hidden rounded-[30px] border border-emerald-300/55 bg-[radial-gradient(circle_at_12%_18%,_rgba(52,211,153,0.46),_transparent_30%),radial-gradient(circle_at_76%_14%,_rgba(14,165,233,0.42),_transparent_28%),radial-gradient(circle_at_88%_82%,_rgba(242,165,27,0.24),_transparent_24%),linear-gradient(135deg,_#063B35_0%,_#075E63_42%,_#0B315F_72%,_#101827_100%)] p-6 text-white shadow-[0_30px_80px_rgba(6,78,59,0.36)] sm:p-8">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/85">
            <Settings className="h-3.5 w-3.5" />
            Personal Workspace
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-[2.25rem]">Settings</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50 sm:text-base">
            Update profile, preferences, and notifications.
          </p>
        </div>

        {/* Success / Error */}
        {success && <div className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-500">{success}</div>}
        {error && <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

        <div className="space-y-6">
          {/* ── LEFT NAV ── */}
          <nav className="overflow-hidden rounded-[26px] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,253,245,0.84),rgba(224,242,254,0.72))] p-2 shadow-[0_18px_44px_rgba(14,163,122,0.1)] backdrop-blur">
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {filteredNavItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`flex min-w-[230px] flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                  activeTab === item.key
                    ? "border-emerald-300 bg-[linear-gradient(135deg,rgba(14,163,122,0.14),rgba(34,199,180,0.12),rgba(14,165,233,0.1))] text-primary shadow-[0_14px_30px_rgba(14,163,122,0.14)]"
                    : "border-transparent bg-white/58 text-slate-600 hover:border-emerald-200 hover:bg-white/82 hover:text-slate-950"
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                  activeTab === item.key ? "bg-primary/15 text-primary" : "bg-white/80 text-slate-500"
                }`}>
                  <item.icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{item.label}</p>
                  <p className={`mt-1 text-xs leading-5 ${
                    activeTab === item.key ? "text-primary/80" : "text-slate-500"
                  }`}>
                    {item.description}
                  </p>
                </div>
              </button>
            ))}
            </div>
          </nav>

          {/* ── MAIN CONTENT ── */}
          <div className="min-w-0">
            {/* ═══════════════════ PROFILE ═══════════════════ */}
            {activeTab === "profile" && (
              <div className="overflow-hidden rounded-[28px] border border-emerald-200/70 bg-[radial-gradient(circle_at_14%_10%,rgba(34,199,180,0.16),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(14,165,233,0.14),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,253,250,0.9),rgba(224,242,254,0.72))] shadow-[0_22px_54px_rgba(14,163,122,0.12)] backdrop-blur">
                <div className="border-b border-white/80 px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0ea37a,#22c7b4,#0ea5e9)] text-white shadow-[0_12px_28px_rgba(14,163,122,0.24)]">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">Profile Information</h2>
                      <p className="mt-1 text-sm text-slate-600">Keep your identity and learning preferences up to date.</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-6 p-6">
                  {/* Profile Picture */}
                  <div className="flex flex-col gap-4 rounded-2xl border border-white/80 bg-white/72 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                    <div
                      className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 text-2xl font-bold text-white"
                      style={{
                        borderColor: "rgba(255,255,255,0.9)",
                        boxShadow: "0 16px 34px rgba(14,163,122,0.2)",
                        background: "linear-gradient(135deg, #0EA37A, #22C7B4, #0EA5E9)",
                      }}
                    >
                      {user?.avatar ? (
                        <img src={getAvatarUrl(user.avatar) || ""} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (user?.first_name?.charAt(0) || user?.email?.charAt(0) || "U").toUpperCase()
                      )}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                      >
                        <Camera className="h-5 w-5 text-white" />
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {profileForm.fullName || user?.email || "Profile photo"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">Use a clear photo for your workspace profile.</p>
                    </div>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    <Button variant="outline" size="sm" className="bg-white/80" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                      <Upload className="h-4 w-4" />
                      {isUploading ? "Uploading..." : "Upload New Photo"}
                    </Button>
                  </div>

                  {/* Name + Job Title */}
                  <div className="grid gap-4 rounded-2xl border border-white/80 bg-white/72 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)] sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Full Name</label>
                      <Input
                        value={profileForm.fullName}
                        onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))}
                        placeholder="Add your full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Job Title</label>
                      <Input
                        value={profileForm.jobTitle}
                        onChange={(e) => setProfileForm((p) => ({ ...p, jobTitle: e.target.value }))}
                        placeholder="Add your job title"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-2 rounded-2xl border border-white/80 bg-white/72 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Email</label>
                    <Input value={profileForm.email} disabled className="opacity-60" />
                  </div>

                  {/* Bio */}
                  <div className="space-y-2 rounded-2xl border border-white/80 bg-white/72 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Bio</label>
                    <Textarea
                      rows={3}
                      value={profileForm.bio}
                      onChange={(e) => setProfileForm((p) => ({ ...p, bio: e.target.value }))}
                      placeholder="Tell us about yourself..."
                    />
                  </div>

                  {/* Skills */}
                  <div className="space-y-3 rounded-2xl border border-white/80 bg-white/72 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Skills</label>
                    <div className="flex flex-wrap gap-2">
                      {profileForm.skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5,#ecfeff)] px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm"
                        >
                          {skill}
                          <button onClick={() => removeSkill(skill)} className="hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                      {profileForm.skills.length === 0 && (
                        <p className="text-sm text-slate-500">No skills added yet.</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSkill();
                          }
                        }}
                        placeholder="Add new skill..."
                        className="flex-1"
                      />
                      <Button variant="outline" size="sm" onClick={addSkill}>
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Learning Preferences */}
                  <div className="space-y-3 rounded-2xl border border-white/80 bg-white/72 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Learning Preferences</label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(207,250,254,0.72))] p-4 shadow-[0_12px_28px_rgba(14,163,122,0.08)]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                            <Zap className="h-4 w-4" />
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Learning Pace</p>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-950">{learningPace}</p>
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setTempPace(learningPace); setShowPaceModal(true); }}>
                          Change
                        </Button>
                      </div>
                      <div className="rounded-2xl border border-cyan-200 bg-[linear-gradient(135deg,rgba(236,254,255,0.94),rgba(240,253,250,0.74))] p-4 shadow-[0_12px_28px_rgba(14,165,233,0.08)]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-600 text-white">
                            <Clock className="h-4 w-4" />
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Preferred Learning Times</p>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-950">{learningTimes}</p>
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setTempTimes(learningTimes.split(", ")); setShowTimesModal(true); }}>
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save */}
                <div className="flex justify-end border-t border-white/80 bg-white/62 p-6">
                  <Button className="gap-2 shadow-[0_14px_30px_rgba(14,163,122,0.18)]" onClick={handleSaveProfile} disabled={isSaving}>
                    <Upload className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}


            {/* ═══════════════════ NOTIFICATIONS ═══════════════════ */}
            {activeTab === "notifications" && (
              <div className="rounded-2xl border border-border bg-card">
                <div className="border-b border-border p-6">
                  <h2 className="text-lg font-semibold text-text-primary">Notification Preferences</h2>
                  <p className="text-sm text-text-secondary">Choose what notifications you receive</p>
                </div>
                <div className="space-y-3 p-6">
                  <ToggleCard label="Email notifications" description="Receive important updates via email" checked={notificationSettings.welcomeEmail} onCheckedChange={(v) => setNotificationSettings((p) => ({ ...p, welcomeEmail: v }))} />
                  <ToggleCard label="Course reminders" description="Get reminded about upcoming deadlines" checked={notificationSettings.deadlineReminder} onCheckedChange={(v) => setNotificationSettings((p) => ({ ...p, deadlineReminder: v }))} />
                  <ToggleCard label="Achievement alerts" description="Be notified when you earn badges or level up" checked={notificationSettings.courseCompletion} onCheckedChange={(v) => setNotificationSettings((p) => ({ ...p, courseCompletion: v }))} />
                  <ToggleCard label="Team updates" description="Receive updates about your team activity" checked={notificationSettings.certificateIssued} onCheckedChange={(v) => setNotificationSettings((p) => ({ ...p, certificateIssued: v }))} />
                </div>
                <div className="flex justify-end border-t border-border p-6">
                  <Button className="gap-2" onClick={handleSaveNotifications}><Bell className="h-4 w-4" /> Save Preferences</Button>
                </div>
              </div>
            )}

            {/* ═══════════════════ PREFERENCES ═══════════════════ */}
            {activeTab === "preferences" && (
              <div className="rounded-2xl border border-border bg-card">
                <div className="border-b border-border p-6">
                  <h2 className="text-lg font-semibold text-text-primary">App Preferences</h2>
                  <p className="text-sm text-text-secondary">Customize your experience</p>
                </div>
                <div className="space-y-4 p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-text-secondary">Language</label>
                      <select value={preferences.language} onChange={(e) => setPreferences((p) => ({ ...p, language: e.target.value }))} className="flex h-10 w-full rounded-[10px] border border-border bg-card px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Arabic</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-text-secondary">Timezone</label>
                      <select value={preferences.timezone} onChange={(e) => setPreferences((p) => ({ ...p, timezone: e.target.value }))} className="flex h-10 w-full rounded-[10px] border border-border bg-card px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <optgroup label="Africa">
                          <option value="Africa/Cairo">Africa/Cairo (GMT+2)</option>
                          <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
                          <option value="Africa/Johannesburg">Africa/Johannesburg (GMT+2)</option>
                          <option value="Africa/Nairobi">Africa/Nairobi (GMT+3)</option>
                          <option value="Africa/Tunis">Africa/Tunis (GMT+1)</option>
                        </optgroup>
                        <optgroup label="America">
                          <option value="America/Anchorage">America/Anchorage (GMT-9)</option>
                          <option value="America/Chicago">America/Chicago (GMT-6)</option>
                          <option value="America/Denver">America/Denver (GMT-7)</option>
                          <option value="America/Halifax">America/Halifax (GMT-4)</option>
                          <option value="America/Los_Angeles">America/Los_Angeles (GMT-8)</option>
                          <option value="America/Mexico_City">America/Mexico_City (GMT-6)</option>
                          <option value="America/New_York">America/New_York (GMT-5)</option>
                          <option value="America/Phoenix">America/Phoenix (GMT-7)</option>
                          <option value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</option>
                          <option value="America/Toronto">America/Toronto (GMT-5)</option>
                          <option value="America/Vancouver">America/Vancouver (GMT-8)</option>
                        </optgroup>
                        <optgroup label="Asia">
                          <option value="Asia/Baghdad">Asia/Baghdad (GMT+3)</option>
                          <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                          <option value="Asia/Dhaka">Asia/Dhaka (GMT+6)</option>
                          <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                          <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                          <option value="Asia/Hong_Kong">Asia/Hong_Kong (GMT+8)</option>
                          <option value="Asia/Jakarta">Asia/Jakarta (GMT+7)</option>
                          <option value="Asia/Jerusalem">Asia/Jerusalem (GMT+2)</option>
                          <option value="Asia/Karachi">Asia/Karachi (GMT+5)</option>
                          <option value="Asia/Kolkata">Asia/Kolkata (GMT+5:30)</option>
                          <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (GMT+8)</option>
                          <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                          <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                          <option value="Asia/Seoul">Asia/Seoul (GMT+9)</option>
                          <option value="Asia/Shanghai">Asia/Shanghai (GMT+8)</option>
                          <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                          <option value="Asia/Taipei">Asia/Taipei (GMT+8)</option>
                          <option value="Asia/Tehran">Asia/Tehran (GMT+3:30)</option>
                          <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                        </optgroup>
                        <optgroup label="Europe">
                          <option value="Europe/Amsterdam">Europe/Amsterdam (GMT+1)</option>
                          <option value="Europe/Athens">Europe/Athens (GMT+2)</option>
                          <option value="Europe/Belgrade">Europe/Belgrade (GMT+1)</option>
                          <option value="Europe/Berlin">Europe/Berlin (GMT+1)</option>
                          <option value="Europe/Brussels">Europe/Brussels (GMT+1)</option>
                          <option value="Europe/Bucharest">Europe/Bucharest (GMT+2)</option>
                          <option value="Europe/Budapest">Europe/Budapest (GMT+1)</option>
                          <option value="Europe/Copenhagen">Europe/Copenhagen (GMT+1)</option>
                          <option value="Europe/Dublin">Europe/Dublin (GMT+0)</option>
                          <option value="Europe/Helsinki">Europe/Helsinki (GMT+2)</option>
                          <option value="Europe/Istanbul">Europe/Istanbul (GMT+3)</option>
                          <option value="Europe/Kyiv">Europe/Kyiv (GMT+2)</option>
                          <option value="Europe/Lisbon">Europe/Lisbon (GMT+0)</option>
                          <option value="Europe/London">Europe/London (GMT+0)</option>
                          <option value="Europe/Madrid">Europe/Madrid (GMT+1)</option>
                          <option value="Europe/Moscow">Europe/Moscow (GMT+3)</option>
                          <option value="Europe/Oslo">Europe/Oslo (GMT+1)</option>
                          <option value="Europe/Paris">Europe/Paris (GMT+1)</option>
                          <option value="Europe/Prague">Europe/Prague (GMT+1)</option>
                          <option value="Europe/Riga">Europe/Riga (GMT+2)</option>
                          <option value="Europe/Rome">Europe/Rome (GMT+1)</option>
                          <option value="Europe/Stockholm">Europe/Stockholm (GMT+1)</option>
                          <option value="Europe/Tallinn">Europe/Tallinn (GMT+2)</option>
                          <option value="Europe/Vienna">Europe/Vienna (GMT+1)</option>
                          <option value="Europe/Vilnius">Europe/Vilnius (GMT+2)</option>
                          <option value="Europe/Warsaw">Europe/Warsaw (GMT+1)</option>
                          <option value="Europe/Zurich">Europe/Zurich (GMT+1)</option>
                        </optgroup>
                        <optgroup label="Oceania">
                          <option value="Australia/Adelaide">Australia/Adelaide (GMT+9:30)</option>
                          <option value="Australia/Brisbane">Australia/Brisbane (GMT+10)</option>
                          <option value="Australia/Darwin">Australia/Darwin (GMT+9:30)</option>
                          <option value="Australia/Melbourne">Australia/Melbourne (GMT+10)</option>
                          <option value="Australia/Perth">Australia/Perth (GMT+8)</option>
                          <option value="Australia/Sydney">Australia/Sydney (GMT+10)</option>
                          <option value="Pacific/Auckland">Pacific/Auckland (GMT+12)</option>
                          <option value="Pacific/Fiji">Pacific/Fiji (GMT+12)</option>
                          <option value="Pacific/Guam">Pacific/Guam (GMT+10)</option>
                          <option value="Pacific/Honolulu">Pacific/Honolulu (GMT-10)</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end border-t border-border p-6">
                  <Button className="gap-2" onClick={handleSavePreferences}><Settings className="h-4 w-4" /> Save Preferences</Button>
                </div>
              </div>
            )}

            {/* ═══════════════════ ENTERPRISE ═══════════════════ */}
            {activeTab === "enterprise" && (isAdmin || isManager) && (
              <div className="rounded-2xl border border-border bg-card">
                <div className="border-b border-border p-6">
                  <h2 className="text-lg font-semibold text-text-primary">Enterprise Settings</h2>
                  <p className="text-sm text-text-secondary">Configure organization-wide settings</p>
                </div>
                <div className="space-y-4 p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><label className="text-xs font-medium text-text-secondary">Organization Name</label><Input defaultValue="TechCorp" /></div>
                    <div className="space-y-2"><label className="text-xs font-medium text-text-secondary">Admin Contact Email</label><Input defaultValue="admin@techcorp.com" /></div>
                  </div>
                  <ToggleCard label="Enforce SSO for all users" description="Require all employees to log in via Azure Entra ID" checked={true} onCheckedChange={() => {}} />
                  <ToggleCard label="Allow self-paced enrollment" description="Let employees enroll in courses without manager approval" checked={false} onCheckedChange={() => {}} />
                </div>
                <div className="flex justify-end border-t border-border p-6">
                  <Button className="gap-2"><Building2 className="h-4 w-4" /> Save Enterprise Settings</Button>
                </div>
              </div>
            )}

            {/* ═══════════════════ PLATFORM ADMIN ═══════════════════ */}
            {activeTab === "platform" && isAdmin && (
              <div className="space-y-4">
                <Section icon={Building2} iconBg="rgba(108,99,255,0.15)" title="Platform Identity" description="How your platform presents itself to employees" defaultExpanded>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><label className="text-xs font-medium text-text-secondary">Platform Name</label><Input value={platformData.platformName} onChange={(e) => setPlatformData((p) => ({ ...p, platformName: e.target.value }))} /><p className="text-xs text-text-secondary">Displayed in the header and branding</p></div>
                    <div className="space-y-2"><label className="text-xs font-medium text-text-secondary">Company Name</label><Input value={platformData.companyName} onChange={(e) => setPlatformData((p) => ({ ...p, companyName: e.target.value }))} /><p className="text-xs text-text-secondary">Your organization&apos;s legal name</p></div>
                    <div className="space-y-2"><label className="text-xs font-medium text-text-secondary">Support Email</label><Input type="email" value={platformData.supportEmail} onChange={(e) => setPlatformData((p) => ({ ...p, supportEmail: e.target.value }))} /><p className="text-xs text-text-secondary">Contact email for support requests</p></div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-text-secondary">Default Language</label>
                      <select value={platformData.defaultLanguage} onChange={(e) => setPlatformData((p) => ({ ...p, defaultLanguage: e.target.value }))} className="flex h-10 w-full rounded-[10px] border border-border bg-card px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Arabic</option>
                      </select>
                      <p className="text-xs text-text-secondary">Platform interface language</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2"><label className="text-xs font-medium text-text-secondary">Welcome Message</label><Textarea rows={3} value={platformData.welcomeMessage} onChange={(e) => setPlatformData((p) => ({ ...p, welcomeMessage: e.target.value }))} /><p className="text-xs text-text-secondary">Shown on the login page and welcome emails</p></div>
                  <div className="mt-6 flex justify-end"><Button className="gap-2"><Upload className="h-4 w-4" /> Save Changes</Button></div>
                </Section>

                <Section icon={Lock} iconBg="rgba(0,212,170,0.15)" title="Authentication" description="Control how employees and admins access the platform">
                  <div className="rounded-xl border border-border bg-background">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3"><Globe className="h-5 w-5 text-text-secondary" /><p className="text-sm font-medium text-text-primary">Azure Entra ID (SSO)</p></div>
                      <div className="flex items-center gap-3">
                        {authData.azureActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                        <Switch checked={authData.azureActive} onCheckedChange={(v) => setAuthData((p) => ({ ...p, azureActive: v }))} />
                      </div>
                    </div>
                    {authData.azureActive && (
                      <div className="border-t border-border p-4">
                        <div className="rounded-xl bg-accent/30 p-4 space-y-4">


                          <div className="rounded-lg border border-border bg-card p-3">
                            <p className="text-xs font-medium text-text-secondary mb-2">Azure Configuration</p>
                            <p className="text-xs text-text-secondary">Tenant ID: <span className="text-text-primary font-mono">Configured via environment</span></p>
                            <p className="text-xs text-text-secondary">Client ID: <span className="text-text-primary font-mono">Configured via environment</span></p>
                            <p className="text-xs text-text-secondary">Redirect URI: <span className="text-text-primary font-mono">https://skillforge.io/auth/callback</span></p>
                          </div>



                          <div className="space-y-3">
                            <div className="flex items-center justify-between"><p className="text-sm text-text-primary">Auto-provision new users on first login</p><Switch checked={authData.autoProvision} onCheckedChange={(v) => setAuthData((p) => ({ ...p, autoProvision: v }))} /></div>
                            <div className="flex items-center justify-between"><p className="text-sm text-text-primary">Restrict to company domain only (@skillforge.io)</p><Switch checked={authData.restrictDomain} onCheckedChange={(v) => setAuthData((p) => ({ ...p, restrictDomain: v }))} /></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 rounded-xl border border-border bg-background p-4">
                    <div className="mb-4 flex items-center gap-2"><p className="text-sm font-medium text-text-primary">Local Authentication</p><Badge variant="outline">Admin only</Badge></div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4"><p className="text-sm text-text-primary">Require strong password</p><Switch checked={authData.requireStrongPassword} onCheckedChange={(v) => setAuthData((p) => ({ ...p, requireStrongPassword: v }))} /></div>
                      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                        <p className="text-sm text-text-primary">Session timeout</p>
                        <div className="flex items-center gap-3">
                          {authData.sessionTimeout && <div className="flex items-center gap-2"><Input type="number" value={authData.sessionDuration} onChange={(e) => setAuthData((p) => ({ ...p, sessionDuration: parseInt(e.target.value) || 0 }))} className="w-20" /><span className="text-xs text-text-secondary">minutes</span></div>}
                          <Switch checked={authData.sessionTimeout} onCheckedChange={(v) => setAuthData((p) => ({ ...p, sessionTimeout: v }))} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end"><Button className="gap-2"><Lock className="h-4 w-4" /> Save Authentication Settings</Button></div>
                </Section>

                <Section icon={Crown} iconBg="rgba(255,215,0,0.15)" title="Admins & Roles" description="Manage administrators and their permissions">
                  <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-text-primary">Current Admins</h4><Button size="sm" className="gap-1"><Users className="h-4 w-4" /> Invite Admin</Button></div>
                  <div className="mt-4 space-y-3">
                    {admins.map((admin) => (
                      <div key={admin.email} className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-white" style={{ background: "linear-gradient(135deg, #6C63FF, #00D4AA)" }}>{admin.name.split(" ").map((n) => n[0]).join("")}</div>
                          <div><p className="text-sm font-medium text-text-primary">{admin.name}</p><p className="text-xs text-text-secondary">{admin.email}</p></div>
                        </div>
                        <div className="flex items-center gap-3"><span className="text-xs font-medium text-text-secondary">{admin.department}</span><Badge variant={admin.role === "Super Admin" ? "default" : "secondary"}>{admin.role}</Badge><Button variant="ghost" size="sm">Edit</Button></div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 border-t border-border pt-6">
                    <h4 className="mb-4 text-sm font-semibold text-text-primary">Role Permissions</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-border">
                          <th className="py-3 px-4 text-left font-medium text-text-secondary">Permission</th>
                          <th className="py-3 px-4 text-center"><div className="flex items-center justify-center gap-1.5"><Crown className="h-4 w-4 text-gold" /><span className="font-medium text-text-primary">Super Admin</span></div></th>
                          <th className="py-3 px-4 text-center"><div className="flex items-center justify-center gap-1.5"><Briefcase className="h-4 w-4 text-primary" /><span className="font-medium text-text-primary">Dept Admin</span></div></th>
                          <th className="py-3 px-4 text-center"><div className="flex items-center justify-center gap-1.5"><GraduationCap className="h-4 w-4 text-secondary" /><span className="font-medium text-text-primary">Trainer</span></div></th>
                        </tr></thead>
                        <tbody>
                          {permissions.map((perm) => (
                            <tr key={perm.name} className="border-b border-border transition-colors hover:bg-accent/20">
                              <td className="py-4 px-4 text-text-primary">{perm.name}</td>
                              <td className="py-4 px-4 text-center">{perm.super ? <CheckCircle2 className="mx-auto h-5 w-5 text-secondary" /> : <XCircle className="mx-auto h-5 w-5 text-text-secondary/30" />}</td>
                              <td className="py-4 px-4 text-center">{perm.dept ? <CheckCircle2 className="mx-auto h-5 w-5 text-secondary" /> : <XCircle className="mx-auto h-5 w-5 text-text-secondary/30" />}</td>
                              <td className="py-4 px-4 text-center">{perm.trainer ? <CheckCircle2 className="mx-auto h-5 w-5 text-secondary" /> : <XCircle className="mx-auto h-5 w-5 text-text-secondary/30" />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Section>

                <Section icon={Mail} iconBg="rgba(255,107,107,0.15)" title="Notifications" description="Configure email notifications and triggers">
                  <h4 className="text-sm font-semibold text-text-primary">Sender Information</h4>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><label className="text-xs font-medium text-text-secondary">Sender Name</label><Input value={platformNotifSettings.senderName} onChange={(e) => setPlatformNotifSettings((p) => ({ ...p, senderName: e.target.value }))} /></div>
                    <div className="space-y-2"><label className="text-xs font-medium text-text-secondary">Sender Email</label><Input type="email" value={platformNotifSettings.senderEmail} onChange={(e) => setPlatformNotifSettings((p) => ({ ...p, senderEmail: e.target.value }))} /></div>
                  </div>
                  <div className="mt-6 border-t border-border pt-6">
                    <h4 className="mb-4 text-sm font-semibold text-text-primary">Email Triggers</h4>
                    <div className="space-y-3">
                      <ToggleCard label="Welcome email on first login" description="Send onboarding email to new users" checked={notificationSettings.welcomeEmail} onCheckedChange={(v) => setNotificationSettings((p: { welcomeEmail: boolean; courseAssigned: boolean; deadlineReminder: boolean; courseCompletion: boolean; certificateIssued: boolean; inactivityAlert: boolean }) => ({ ...p, welcomeEmail: v }))} />
                      <ToggleCard label="Course assigned notification" description="Notify users when courses are assigned" checked={notificationSettings.courseAssigned} onCheckedChange={(v) => setNotificationSettings((p: { welcomeEmail: boolean; courseAssigned: boolean; deadlineReminder: boolean; courseCompletion: boolean; certificateIssued: boolean; inactivityAlert: boolean }) => ({ ...p, courseAssigned: v }))} />
                      <ToggleCard label="Deadline reminder" description="Remind users of upcoming course deadlines" checked={notificationSettings.deadlineReminder} onCheckedChange={(v) => setNotificationSettings((p: { welcomeEmail: boolean; courseAssigned: boolean; deadlineReminder: boolean; courseCompletion: boolean; certificateIssued: boolean; inactivityAlert: boolean }) => ({ ...p, deadlineReminder: v }))} />
                      <ToggleCard label="Course completion confirmation" description="Congratulate users on completing courses" checked={notificationSettings.courseCompletion} onCheckedChange={(v) => setNotificationSettings((p: { welcomeEmail: boolean; courseAssigned: boolean; deadlineReminder: boolean; courseCompletion: boolean; certificateIssued: boolean; inactivityAlert: boolean }) => ({ ...p, courseCompletion: v }))} />
                      <ToggleCard label="Certificate issued notification" description="Notify users when certificates are ready" checked={notificationSettings.certificateIssued} onCheckedChange={(v) => setNotificationSettings((p: { welcomeEmail: boolean; courseAssigned: boolean; deadlineReminder: boolean; courseCompletion: boolean; certificateIssued: boolean; inactivityAlert: boolean }) => ({ ...p, certificateIssued: v }))} />
                      <ToggleCard label="Inactivity alert" description="Alert users who haven't logged in recently" checked={notificationSettings.inactivityAlert} onCheckedChange={(v) => setNotificationSettings((p: { welcomeEmail: boolean; courseAssigned: boolean; deadlineReminder: boolean; courseCompletion: boolean; certificateIssued: boolean; inactivityAlert: boolean }) => ({ ...p, inactivityAlert: v }))} />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end"><Button className="gap-2"><Mail className="h-4 w-4" /> Save Notification Settings</Button></div>
                </Section>

                <Section icon={Activity} iconBg="rgba(108,99,255,0.15)" title="Event System (RabbitMQ)" description="Message broker configuration and event management">
                  <h4 className="text-sm font-semibold text-text-primary">Broker Connection</h4>
                  <div className="mt-3 flex gap-3"><Input value={brokerConnection} onChange={(e) => setBrokerConnection(e.target.value)} className="flex-1" /><Button variant="outline" className="gap-2"><Activity className="h-4 w-4" /> Test Connection</Button></div>
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-secondary/20 bg-secondary/10 p-3"><CheckCircle2 className="h-5 w-5 text-secondary" /><span className="text-sm text-text-primary">Connected</span><Badge variant="secondary">Healthy</Badge></div>
                  <div className="mt-6 border-t border-border pt-6">
                    <h4 className="mb-4 text-sm font-semibold text-text-primary">Published Events</h4>
                    <div className="space-y-3">
                      {rabbitMQEvents.map((ev) => (
                        <div key={ev.event} className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
                          <div className="flex items-center gap-3"><code className="rounded-lg bg-primary/10 px-3 py-1 font-mono text-sm text-primary">{ev.event}</code><Badge variant="secondary">Active</Badge></div>
                          <div className="flex items-center gap-3"><span className="text-xs text-text-secondary">{ev.description}</span><Database className="h-4 w-4 text-text-secondary/50" /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>

                <Section icon={Award} iconBg="rgba(255,215,0,0.15)" title="Certificates" description="Configure certificate generation and distribution">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2"><label className="text-xs font-medium text-text-secondary">Issuing Organisation Name</label><Input value={certificateSettings.organisationName} onChange={(e) => setCertificateSettings((p) => ({ ...p, organisationName: e.target.value }))} /><p className="text-xs text-text-secondary">Appears on the certificate</p></div>
                    <div className="space-y-2 sm:col-span-2"><label className="text-xs font-medium text-text-secondary">Signatory Name</label><Input value={certificateSettings.signatoryName} onChange={(e) => setCertificateSettings((p) => ({ ...p, signatoryName: e.target.value }))} /><p className="text-xs text-text-secondary">Name and title of the person signing certificates</p></div>
                    <div className="space-y-2"><label className="text-xs font-medium text-text-secondary">Certificate Validity</label><div className="flex items-center gap-2"><Input type="number" value={certificateSettings.validityMonths} onChange={(e) => setCertificateSettings((p) => ({ ...p, validityMonths: parseInt(e.target.value) || 0 }))} className="w-24" /><span className="text-sm text-text-secondary">months</span></div><p className="text-xs text-text-secondary">How long certificates remain valid</p></div>
                  </div>
                  <div className="mt-6 border-t border-border pt-6">
                    <h4 className="mb-4 text-sm font-semibold text-text-primary">Certificate Options</h4>
                    <div className="space-y-3">
                      <ToggleCard label="Auto-generate certificate on course completion" description="Automatically create certificates when courses are completed" checked={certificateSettings.autoGenerate} onCheckedChange={(v) => setCertificateSettings((p) => ({ ...p, autoGenerate: v }))} />
                      <ToggleCard label="Email certificate PDF to employee" description="Send the certificate PDF to the learner's email" checked={certificateSettings.emailPDF} onCheckedChange={(v) => setCertificateSettings((p) => ({ ...p, emailPDF: v }))} />
                      <ToggleCard label="Notify dept admin on certificate issued" description="Alert department admins when certificates are generated" checked={certificateSettings.notifyAdmin} onCheckedChange={(v) => setCertificateSettings((p) => ({ ...p, notifyAdmin: v }))} />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end"><Button className="gap-2"><Award className="h-4 w-4" /> Save Certificate Settings</Button></div>
                </Section>

                <Section icon={AlertTriangle} iconBg="rgba(255,107,107,0.15)" title="Danger Zone" description="Irreversible and destructive actions" danger>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3"><Lock className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="text-sm font-semibold text-destructive">Deactivate all employee accounts</p><p className="text-xs text-text-secondary">Temporarily suspend all user access to the platform. Admins remain active.</p></div></div>
                        <Button variant="destructive" size="sm" className="gap-1.5 shrink-0"><Lock className="h-4 w-4" /> Deactivate All Accounts</Button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3"><Activity className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="text-sm font-semibold text-destructive">Reset all course progress</p><p className="text-xs text-text-secondary">Clear all learning progress, XP, and achievements for all users. Cannot be undone.</p></div></div>
                        <Button variant="destructive" size="sm" className="gap-1.5 shrink-0"><Activity className="h-4 w-4" /> Reset All Progress</Button>
                      </div>
                    </div>
                    <div className="rounded-xl border-2 border-destructive/50 bg-destructive/5 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3"><Trash2 className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="text-sm font-semibold text-destructive">Purge platform data</p><p className="text-xs text-text-secondary">Permanently delete all user data, courses, and analytics. This action is irreversible.</p></div></div>
                        <Button variant="destructive" size="sm" className="gap-1.5 shrink-0"><Trash2 className="h-4 w-4" /> Purge All Data</Button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-card p-4"><AlertTriangle className="h-5 w-5 shrink-0 text-gold" /><p className="text-xs text-text-secondary">All dangerous actions require additional confirmation and may require your password or 2FA verification.</p></div>
                </Section>
              </div>
            )}
          </div>
        </div>

        {/* ── Learning Pace Modal ── */}
        {showPaceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPaceModal(false)}>
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-text-primary">Learning Pace</h3>
              <p className="mt-1 text-sm text-text-secondary">How fast do you want to learn?</p>
              <div className="mt-4 space-y-2">
                {[
                  { label: "Relaxed", desc: "1–2 lessons per week" },
                  { label: "Moderate", desc: "3–5 lessons per week" },
                  { label: "Intensive", desc: "6–10 lessons per week" },
                  { label: "Accelerated", desc: "10+ lessons per week" },
                ].map((opt) => {
                  const value = `${opt.label} - ${opt.desc}`;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => setTempPace(value)}
                      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors ${
                        tempPace === value
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-text-primary">{opt.label}</p>
                        <p className="text-xs text-text-secondary">{opt.desc}</p>
                      </div>
                      {tempPace === value && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowPaceModal(false)}>Cancel</Button>
                <Button onClick={() => { setLearningPace(tempPace); setShowPaceModal(false); }}>Save</Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Learning Times Modal ── */}
        {showTimesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowTimesModal(false)}>
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-text-primary">Preferred Learning Times</h3>
              <p className="mt-1 text-sm text-text-secondary">Select all time slots that work for you</p>
              <div className="mt-4 space-y-2">
                {[
                  "Weekday mornings",
                  "Weekday afternoons",
                  "Weekday evenings",
                  "Weekend mornings",
                  "Weekend afternoons",
                  "Weekend evenings",
                ].map((slot) => {
                  const isSelected = tempTimes.includes(slot);
                  return (
                    <button
                      key={slot}
                      onClick={() => {
                        setTempTimes((prev) =>
                          prev.includes(slot) ? prev.filter((t) => t !== slot) : [...prev, slot]
                        );
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors ${
                        isSelected
                          ? "border-secondary bg-secondary/10"
                          : "border-border bg-background hover:border-secondary/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-text-secondary" />
                        <p className="text-sm font-medium text-text-primary">{slot}</p>
                      </div>
                      {isSelected && <CheckCircle2 className="h-5 w-5 text-secondary" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowTimesModal(false)}>Cancel</Button>
                <Button onClick={() => { setLearningTimes(tempTimes.join(", ")); setShowTimesModal(false); }}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
