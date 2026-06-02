"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {Mail, Shield, UserPlus} from "lucide-react";

import {AdminShell} from "@/app/components/layout/AdminShell";
import {Button} from "@/app/components/ui/Button";
import {Input} from "@/app/components/ui/Input";
import {Select} from "@/app/components/ui/Select";
import {useAuth} from "@/app/context/AuthContext";
import {api} from "@/app/lib/api";
import {
  DEFAULT_DEPARTMENTS,
  addDepartmentForTenant,
  getDepartmentsForTenant,
} from "@/app/lib/departments";
import {routes} from "@/app/lib/routes";
import {UsersManagementNav} from "../UsersManagementNav";

type InviteForm = {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  department: string;
  password: string;
};

type CreatedUser = {
  id: string;
};

const roles = ["Admin", "Manager", "TeamManager", "TeamMember", "TeamIntern", "LearningExpert"];
const namePattern = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/;
const departmentPattern = /^[A-Za-z0-9À-ÖØ-öø-ÿ&'() /.-]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const initialForm: InviteForm = {
  first_name: "",
  last_name: "",
  email: "",
  role: "TeamMember",
  department: DEFAULT_DEPARTMENTS[0],
  password: "",
};

const fieldClassName =
  "h-11 border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100";
const selectClassName =
  "h-11 border-slate-300 bg-white text-slate-950 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100";

function validateName(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length < 2) return `${label} must contain at least 2 characters.`;
  if (trimmed.length > 50) return `${label} must be 50 characters or fewer.`;
  if (!namePattern.test(trimmed)) {
    return `${label} can only contain letters, spaces, apostrophes, and hyphens.`;
  }
  return "";
}

function getEmailDomain(email: string): string {
  return email.trim().toLowerCase().split("@").pop() || "";
}

function validateForm(
  form: InviteForm,
  adminEmailDomain?: string,
): Record<keyof InviteForm, string> {
  const email = form.email.trim();
  const department = form.department.trim();
  const emailFormatError = !email
    ? "Email is required."
    : !emailPattern.test(email)
      ? "Enter a valid email address."
      : email.length > 254
        ? "Email must be 254 characters or fewer."
        : "";
  const emailDomainError =
    !emailFormatError && adminEmailDomain && getEmailDomain(email) !== adminEmailDomain
      ? `Email domain must match your company domain: ${adminEmailDomain}.`
      : "";
  return {
    first_name: validateName(form.first_name, "First name"),
    last_name: validateName(form.last_name, "Last name"),
    email: emailFormatError || emailDomainError,
    role: roles.includes(form.role) ? "" : "Select a valid role.",
    department: !department
      ? "Department is required."
      : department.length > 80
        ? "Department must be 80 characters or fewer."
        : !departmentPattern.test(department)
          ? "Department contains unsupported characters."
          : "",
    password:
      form.password && !passwordPattern.test(form.password)
        ? "Password must be at least 8 characters and include uppercase, lowercase, and a number."
        : "",
  };
}

function hasValidationErrors(errors: Record<keyof InviteForm, string>) {
  return Object.values(errors).some(Boolean);
}

export default function AdminCreateUserPage() {
  const router = useRouter();
  const {user} = useAuth();
  const [form, setForm] = useState<InviteForm>(initialForm);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>(
    getDepartmentsForTenant(user?.tenant_id, DEFAULT_DEPARTMENTS),
  );
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [touched, setTouched] = useState<Partial<Record<keyof InviteForm, boolean>>>({});
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  const adminEmailDomain = user?.email ? getEmailDomain(user.email) : "";
  const validationErrors = validateForm(form, adminEmailDomain);
  const canSubmit = !hasValidationErrors(validationErrors) && !isSubmitting;
  const getFieldError = (field: keyof InviteForm) =>
    (touched[field] || showValidationErrors) ? validationErrors[field] : "";
  const markTouched = (field: keyof InviteForm) =>
    setTouched((current) => ({...current, [field]: true}));

  const handleAddDepartment = () => {
    const departmentName = newDepartmentName.trim();
    if (
      !departmentName ||
      departmentName.length > 80 ||
      !departmentPattern.test(departmentName)
    ) {
      setError(
        "New department must be 1-80 characters and only use letters, numbers, spaces, &, apostrophes, parentheses, /, dots, or hyphens.",
      );
      return;
    }
    const nextDepartments = addDepartmentForTenant(user?.tenant_id, departmentName);
    setDepartmentOptions(nextDepartments);
    setForm((current) => ({...current, department: departmentName}));
    setNewDepartmentName("");
    setShowAddDepartment(false);
  };

  const handleSubmit = async () => {
    setShowValidationErrors(true);
    if (!canSubmit) {
      setError("Please correct the highlighted fields before adding the user.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const createdUser = await api.post<CreatedUser>("/api/v1/identity/users/invite", {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role: form.role,
        department: form.department || DEFAULT_DEPARTMENTS[0],
        password: form.password || undefined,
      });

      if (form.password) {
        await api.post(`/api/v1/identity/users/${createdUser.id}/set-local-password`, {
          password: form.password,
        });
      }

      setSuccess("User created successfully.");
      router.push(routes.adminUserDetail(createdUser.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || user.role !== "Admin") {
    return (
      <AdminShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-slate-400" />
            <h2 className="mt-4 text-xl font-semibold text-slate-950">Access Denied</h2>
            <p className="mt-2 text-slate-600">This page is only accessible to admins.</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <UsersManagementNav />

        <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
            <UserPlus className="h-3.5 w-3.5" />
            User Administration
          </div>
          <div className="mt-5 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Add User</h1>
            <p className="mt-4 text-sm leading-7 text-slate-200 sm:text-base">
              Capture the identity, access role, department, and optional local password needed to
              create a complete platform user.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                Identity setup
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                Role assignment
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                Department placement
              </span>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.07)]">
          <div className="space-y-5 p-6">
            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {success}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                  First Name
                </label>
                <Input
                  value={form.first_name}
                  onChange={(event) =>
                    setForm((current) => ({...current, first_name: event.target.value}))
                  }
                  onBlur={() => markTouched("first_name")}
                  placeholder="First name"
                  autoComplete="off"
                  className={fieldClassName}
                />
                {getFieldError("first_name") && (
                  <p className="text-xs font-medium text-rose-600">
                    {getFieldError("first_name")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                  Last Name
                </label>
                <Input
                  value={form.last_name}
                  onChange={(event) =>
                    setForm((current) => ({...current, last_name: event.target.value}))
                  }
                  onBlur={() => markTouched("last_name")}
                  placeholder="Last name"
                  autoComplete="off"
                  className={fieldClassName}
                />
                {getFieldError("last_name") && (
                  <p className="text-xs font-medium text-rose-600">
                    {getFieldError("last_name")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                Email
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({...current, email: event.target.value}))
                }
                onBlur={() => markTouched("email")}
                placeholder="user@company.com"
                autoComplete="off"
                className={fieldClassName}
              />
              {getFieldError("email") && (
                <p className="text-xs font-medium text-rose-600">{getFieldError("email")}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                  Role
                </label>
                <Select
                  options={roles.map((role) => ({value: role, label: role}))}
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({...current, role: event.target.value}))
                  }
                  onBlur={() => markTouched("role")}
                  className={selectClassName}
                />
                {getFieldError("role") && (
                  <p className="text-xs font-medium text-rose-600">{getFieldError("role")}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                  Department
                </label>
                <Select
                  options={departmentOptions.map((department) => ({
                    value: department,
                    label: department,
                  }))}
                  value={form.department || DEFAULT_DEPARTMENTS[0]}
                  onChange={(event) =>
                    setForm((current) => ({...current, department: event.target.value}))
                  }
                  onBlur={() => markTouched("department")}
                  className={selectClassName}
                />
                {getFieldError("department") && (
                  <p className="text-xs font-medium text-rose-600">
                    {getFieldError("department")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddDepartment((current) => !current)}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                >
                  {showAddDepartment ? "Cancel new department" : "Add new department"}
                </button>
              </div>
            </div>

            {showAddDepartment && (
              <div className="flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                <Input
                  value={newDepartmentName}
                  onChange={(event) => setNewDepartmentName(event.target.value)}
                  placeholder="New department name"
                  className={fieldClassName}
                />
                <Button type="button" variant="outline" onClick={handleAddDepartment}>
                  Save
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                Password
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({...current, password: event.target.value}))
                }
                onBlur={() => markTouched("password")}
                placeholder="Set a password for direct local login"
                autoComplete="new-password"
                className={fieldClassName}
              />
              {getFieldError("password") && (
                <p className="text-xs font-medium text-rose-600">{getFieldError("password")}</p>
              )}
              <p className="text-[11px] font-medium text-slate-600">
                Leave blank to send an invite and let the user set access later.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button
                variant="outline"
                onClick={() => router.push(routes.adminUsers)}
                className="border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950"
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                <Mail className="h-4 w-4" />
                {isSubmitting ? "Adding..." : "Add User"}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
