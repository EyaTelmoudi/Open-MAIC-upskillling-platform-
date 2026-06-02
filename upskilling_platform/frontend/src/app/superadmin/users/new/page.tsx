"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, KeyRound, Mail, Shield, Users } from "lucide-react";

import {
  createAdminDirect,
  createPlatformUser,
  getPlatformUsers,
  getTenants,
  type TenantResponse,
  type UserResponse,
} from "@/app/lib/api";
import { addDepartmentForTenant, getDepartmentsForTenant } from "@/app/lib/departments";
import { routes } from "@/app/lib/routes";
import { UsersManagementNav } from "../UsersManagementNav";

const ROLE_OPTIONS = [
  "Admin",
  "Manager",
  "LearningExpert",
  "TeamManager",
  "TeamMember",
  "TeamIntern",
];

const MAX_PAGE_SIZE = 100;

type NewUserForm = {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  tenant_id: string;
  department: string;
  password: string;
};

type FormErrors = Partial<Record<keyof NewUserForm, string>>;

const initialForm: NewUserForm = {
  first_name: "",
  last_name: "",
  email: "",
  role: "TeamMember",
  tenant_id: "",
  department: "",
  password: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getEmailDomain(email: string) {
  return email.trim().toLowerCase().split("@").pop() || "";
}

function validateNewUserForm(form: NewUserForm, selectedTenant: TenantResponse | null): FormErrors {
  const errors: FormErrors = {};
  const firstName = form.first_name.trim();
  const lastName = form.last_name.trim();
  const email = form.email.trim();

  if (!firstName) {
    errors.first_name = "First name is required.";
  } else if (firstName.length < 2) {
    errors.first_name = "First name must contain at least 2 characters.";
  }

  if (!lastName) {
    errors.last_name = "Last name is required.";
  } else if (lastName.length < 2) {
    errors.last_name = "Last name must contain at least 2 characters.";
  }

  if (!email) {
    errors.email = "Email is required.";
  } else if (!emailPattern.test(email)) {
    errors.email = "Enter a valid email address, for example user@company.com.";
  } else if (
    selectedTenant?.email_domain &&
    getEmailDomain(email) !== selectedTenant.email_domain.toLowerCase()
  ) {
    errors.email = `Email domain must match ${selectedTenant.email_domain}.`;
  }

  if (!form.tenant_id) {
    errors.tenant_id = "Select the company for this user.";
  }

  if (!ROLE_OPTIONS.includes(form.role)) {
    errors.role = "Select a valid role.";
  }

  if (!form.password) {
    errors.password = "Password is required for direct local login.";
  } else if (form.password.length < 8) {
    errors.password = "Password must contain at least 8 characters.";
  }

  return errors;
}

function hasErrors(errors: FormErrors) {
  return Object.values(errors).some(Boolean);
}

function fieldClassName(hasError?: boolean) {
  return [
    "w-full rounded-lg border bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:outline-none focus:ring-2",
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-slate-200 focus:border-emerald-400 focus:ring-emerald-100",
  ].join(" ");
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>;
}

export default function SuperAdminNewUserPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantFromQuery = searchParams.get("tenant") || "";

  const [users, setUsers] = useState<UserResponse[]>([]);
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [form, setForm] = useState<NewUserForm>({ ...initialForm, tenant_id: tenantFromQuery });
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  useEffect(() => {
    async function loadData() {
      try {
        const [usersData, tenantsData] = await Promise.all([
          getPlatformUsers(1, MAX_PAGE_SIZE),
          getTenants(1, MAX_PAGE_SIZE),
        ]);
        setUsers(usersData.users || []);
        setTenants(tenantsData.tenants || []);
      } catch (error) {
        console.error("Failed to load new user data:", error);
        setMessage({ type: "error", text: "Failed to load companies." });
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  useEffect(() => {
    const tenantUsers = users.filter((user) => user.tenant_id === form.tenant_id);
    setDepartmentOptions(
      getDepartmentsForTenant(
        form.tenant_id || null,
        tenantUsers.map((user) => user.department)
      )
    );
    if (!form.tenant_id) {
      setForm((current) => ({ ...current, department: "" }));
    }
  }, [form.tenant_id, users]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === form.tenant_id) || null,
    [form.tenant_id, tenants]
  );

  function updateForm(field: keyof NewUserForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "tenant_id" ? { department: "" } : {}),
    }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setMessage(null);
  }

  function handleAddDepartment() {
    if (!form.tenant_id) {
      setMessage({ type: "error", text: "Select a company before adding a department." });
      return;
    }

    const departmentName = newDepartmentName.trim();
    if (!departmentName) {
      return;
    }

    const nextDepartments = addDepartmentForTenant(form.tenant_id, departmentName);
    setDepartmentOptions(nextDepartments);
    setForm((current) => ({ ...current, department: departmentName }));
    setNewDepartmentName("");
    setShowAddDepartment(false);
  }

  async function handleCreateUser() {
    const nextErrors = validateNewUserForm(form, selectedTenant);
    setFieldErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      setMessage({ type: "error", text: "Please correct the highlighted fields before creating the user." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        tenant_id: form.tenant_id,
        department: form.department || undefined,
      };
      const createdId =
        form.role === "Admin"
          ? (
              await createAdminDirect({
                ...payload,
                password: form.password,
              })
            ).admin_id
          : (
              await createPlatformUser({
                ...payload,
                role: form.role,
                status: "active",
                password: form.password,
              })
            ).id;

      router.push(routes.superadminUserDetail(createdId));
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to create user.",
      });
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm font-medium text-slate-700">Loading user form...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <UsersManagementNav />

      {message && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">First Name *</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => updateForm("first_name", e.target.value)}
                placeholder="First name"
                className={`${fieldClassName(Boolean(fieldErrors.first_name))} placeholder:text-slate-400`}
                aria-invalid={Boolean(fieldErrors.first_name)}
              />
              <FieldError message={fieldErrors.first_name} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Last Name *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => updateForm("last_name", e.target.value)}
                placeholder="Last name"
                className={`${fieldClassName(Boolean(fieldErrors.last_name))} placeholder:text-slate-400`}
                aria-invalid={Boolean(fieldErrors.last_name)}
              />
              <FieldError message={fieldErrors.last_name} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateForm("email", e.target.value)}
                placeholder="user@company.com"
                className={`${fieldClassName(Boolean(fieldErrors.email))} placeholder:text-slate-400`}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              <FieldError message={fieldErrors.email} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Company *</label>
              <select
                value={form.tenant_id}
                onChange={(e) => updateForm("tenant_id", e.target.value)}
                className={fieldClassName(Boolean(fieldErrors.tenant_id))}
                aria-invalid={Boolean(fieldErrors.tenant_id)}
              >
                <option value="">Select company</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.tenant_id} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Role *</label>
              <select
                value={form.role}
                onChange={(e) => updateForm("role", e.target.value)}
                className={fieldClassName(Boolean(fieldErrors.role))}
                aria-invalid={Boolean(fieldErrors.role)}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.role} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Department</label>
              <select
                value={form.department}
                onChange={(e) => updateForm("department", e.target.value)}
                disabled={!form.tenant_id}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">{form.tenant_id ? "Select department" : "Select company first"}</option>
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddDepartment((current) => !current)}
                className="mt-2 text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-800"
              >
                {showAddDepartment ? "Cancel new department" : "Add new department"}
              </button>
              {showAddDepartment && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={newDepartmentName}
                    onChange={(e) => setNewDepartmentName(e.target.value)}
                    placeholder="New department name"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddDepartment}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateForm("password", e.target.value)}
                placeholder="Minimum 8 characters for local login"
                className={`${fieldClassName(Boolean(fieldErrors.password))} placeholder:text-slate-400`}
                aria-invalid={Boolean(fieldErrors.password)}
              />
              <FieldError message={fieldErrors.password} />
              <p className="mt-2 text-xs text-slate-500">
                Every new user must receive direct local login credentials at creation time.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => router.push(routes.superadminUsers)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateUser}
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create User"}
            </button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(243,249,251,0.96)_100%)] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <h2 className="text-lg font-semibold text-slate-950">Account Preview</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-500" />
                {form.email || "user@company.com"}
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                {selectedTenant?.name || "Select company"}
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-700" />
                {form.role}
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                {form.department || "No department selected"}
              </div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-slate-500" />
                Direct local login enabled
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
