"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Zap, ChevronRight, ChevronLeft, Check, Loader2, Building2, User, Shield, Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Input";
import { Button } from "@/app/components/ui/Button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SETUP_KEY = process.env.NEXT_PUBLIC_SETUP_KEY || "";

const STEPS = [
  { id: 0, title: "Welcome", icon: Zap },
  { id: 1, title: "Admin Account", icon: User },
  { id: 2, title: "Organization", icon: Users },
  { id: 3, title: "First Tenant", icon: Building2 },
  { id: 4, title: "Review & Launch", icon: Shield },
];

export default function SetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [adminData, setAdminData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });

  const [tenantData, setTenantData] = useState({
    name: "",
    slug: "",
    email_domain: "",
  });

  const [groupData, setGroupData] = useState({
    groupName: "",
    groupWebsite: "",
  });

  const [completed, setCompleted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  useEffect(() => {
    if (completed && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (completed && countdown === 0) {
      router.push("/superadmin/login");
    }
  }, [completed, countdown, router]);

  async function checkSetupStatus() {
    try {
      const response = await fetch(`${API_BASE}/setup/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.setup_completed) {
          router.push("/login");
        }
      }
    } catch {
      // Ignore errors - stay on setup page
    }
  }

  async function handleNext() {
    setLoading(true);
    setError("");

    try {
      if (currentStep === 1) {
        const response = await fetch(`${API_BASE}/setup/admin`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Setup-Key": SETUP_KEY,
          },
          body: JSON.stringify({
            email: adminData.email,
            password: adminData.password,
            first_name: adminData.firstName,
            last_name: adminData.lastName,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          let msg = "Failed to create admin";
          if (typeof data.detail === "string") msg = data.detail;
          else if (Array.isArray(data.detail)) {
            msg = data.detail
              .map((e: any) => {
                let m = e.msg;
                if (m.includes("String")) m = m.replace("String", "Password");
                return m;
              })
              .join(", ");
          }
          throw new Error(msg);
        }
      } else if (currentStep === 2) {
        const response = await fetch(`${API_BASE}/setup/group`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Setup-Key": SETUP_KEY,
          },
          body: JSON.stringify({
            group_name: groupData.groupName,
            group_website: groupData.groupWebsite || null,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          let msg = "Failed to configure organization";
          if (typeof data.detail === "string") msg = data.detail;
          else if (Array.isArray(data.detail)) msg = data.detail.map((e: any) => e.msg).join(", ");
          throw new Error(msg);
        }
      } else if (currentStep === 3 && tenantData.name && tenantData.slug) {
        const response = await fetch(`${API_BASE}/setup/tenant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Setup-Key": SETUP_KEY,
          },
          body: JSON.stringify({
            name: tenantData.name,
            slug: tenantData.slug,
            email_domain: tenantData.email_domain,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          let msg = "Failed to create tenant";
          if (typeof data.detail === "string") msg = data.detail;
          else if (Array.isArray(data.detail)) msg = data.detail.map((e: any) => e.msg).join(", ");
          throw new Error(msg);
        }
      } else if (currentStep === 4) {
        const response = await fetch(`${API_BASE}/setup/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Setup-Key": SETUP_KEY,
          },
          body: JSON.stringify({ confirm: true }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "Failed to complete setup");
        }

        const data = await response.json();
        setCompleted(true);
        setSuccessMessage(data.message || "Platform is live!");
        return;
      }

      setCurrentStep(currentStep + 1);
    } catch (err: any) {
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "object" && err !== null) {
        setError(JSON.stringify(err));
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 mx-auto animate-pulse">
              <Check className="h-10 w-10 text-green-500" />
            </div>
            <h2 className="text-3xl font-bold mb-2 text-green-500">
              Platform is live!
            </h2>
            <p className="text-text-secondary mb-6">
              {successMessage}
            </p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-text-secondary">Redirecting in</span>
              <span className="text-2xl font-bold text-primary">{countdown}</span>
              <span className="text-text-secondary">seconds...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="w-64 border-r border-border p-6 hidden md:block">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">SkillForge</span>
          </div>
        </div>
        <nav className="space-y-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  isActive ? "bg-primary/10 text-primary" : "text-text-secondary"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">{step.title}</span>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 p-6 md:p-12">
        <div className="max-w-xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>{STEPS[currentStep].title}</CardTitle>
              <CardDescription>
                Step {currentStep + 1} of {STEPS.length}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                  {error}
                </div>
              )}

              {currentStep === 0 && (
                <div className="space-y-4">
                  <p className="text-text-secondary">
                    Welcome to SkillForge! This wizard will help you complete the initial
                    platform setup.
                  </p>
                  <ul className="space-y-2 text-text-secondary">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Create Super Admin account
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      Configure your organization and first tenant
                    </li>
                  </ul>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      placeholder="admin@skillforge.io"
                      value={adminData.email}
                      onChange={(e) =>
                        setAdminData({ ...adminData, email: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={adminData.password}
                      onChange={(e) =>
                        setAdminData({ ...adminData, password: e.target.value })
                      }
                    />
                    <p className="text-xs text-text-secondary">
                      Password must be at least 8 characters long.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">First Name</label>
                      <Input
                        placeholder="Admin"
                        value={adminData.firstName}
                        onChange={(e) =>
                          setAdminData({ ...adminData, firstName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Last Name</label>
                      <Input
                        placeholder="User"
                        value={adminData.lastName}
                        onChange={(e) =>
                          setAdminData({ ...adminData, lastName: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <p className="text-text-secondary">
                    Configure the organization that owns and manages this platform instance.
                  </p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Organization Name</label>
                    <Input
                      placeholder="Example Holding"
                      value={groupData.groupName}
                      onChange={(e) =>
                        setGroupData({ ...groupData, groupName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Website (Optional)</label>
                    <Input
                      placeholder="https://example.com"
                      value={groupData.groupWebsite}
                      onChange={(e) =>
                        setGroupData({ ...groupData, groupWebsite: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-4">
                  <p className="text-text-secondary">
                    Skip this step if you want to add tenants manually later from the
                    admin dashboard.
                  </p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Company Name</label>
                    <Input
                      placeholder="Example Company"
                      value={tenantData.name}
                      onChange={(e) =>
                        setTenantData({ ...tenantData, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Slug (URL identifier)</label>
                    <Input
                      placeholder="example-company"
                      value={tenantData.slug}
                      onChange={(e) =>
                        setTenantData({
                          ...tenantData,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email Domain (optional)</label>
                    <Input
                      placeholder="company.com"
                      value={tenantData.email_domain}
                      onChange={(e) =>
                        setTenantData({ ...tenantData, email_domain: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Used to match users from the same company during login.
                    </p>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-card p-4 space-y-3">
                    <h3 className="font-medium">Review Configuration</h3>
                    <div className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Admin Email</span>
                        <span>{adminData.email || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Admin Name</span>
                        <span>
                          {[adminData.firstName, adminData.lastName].filter(Boolean).join(" ") || "Not set"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Organization</span>
                        <span>{groupData.groupName || "Not set"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Organization Website</span>
                        <span>{groupData.groupWebsite || "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">First Tenant</span>
                        <span>{tenantData.name || "None"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Tenant Slug</span>
                        <span>{tenantData.slug || "Not provided"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Email Domain</span>
                        <span>{tenantData.email_domain || "Not provided"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStep === 0 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleNext} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {currentStep === STEPS.length - 1 ? "Launch Platform" : "Next"}
                      {currentStep < STEPS.length - 1 && (
                        <ChevronRight className="h-4 w-4 ml-2" />
                      )}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
