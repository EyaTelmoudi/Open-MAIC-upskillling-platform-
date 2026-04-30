export const DEFAULT_DEPARTMENTS = [
  "Tech",
  "HR",
  "Finance",
  "Marketing",
  "Design",
  "Sales",
  "Operations",
];

function getStorageKey(tenantId: string | null | undefined): string {
  return `upskilling.departments.${tenantId || "global"}`;
}

function normalizeDepartmentName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueDepartments(values: Array<string | null | undefined>): string[] {
  const seen = new Map<string, string>();

  values.forEach((value) => {
    const normalized = normalizeDepartmentName(value || "");
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  });

  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function getDepartmentsForTenant(
  tenantId: string | null | undefined,
  existingDepartments: Array<string | null | undefined> = []
): string[] {
  if (typeof window === "undefined") {
    return uniqueDepartments([...DEFAULT_DEPARTMENTS, ...existingDepartments]);
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(tenantId));
    const stored = raw ? (JSON.parse(raw) as string[]) : [];
    return uniqueDepartments([...DEFAULT_DEPARTMENTS, ...stored, ...existingDepartments]);
  } catch {
    return uniqueDepartments([...DEFAULT_DEPARTMENTS, ...existingDepartments]);
  }
}

export function addDepartmentForTenant(
  tenantId: string | null | undefined,
  departmentName: string
): string[] {
  const normalized = normalizeDepartmentName(departmentName);
  if (!normalized) {
    return getDepartmentsForTenant(tenantId);
  }

  const nextDepartments = uniqueDepartments([
    ...getDepartmentsForTenant(tenantId),
    normalized,
  ]);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(getStorageKey(tenantId), JSON.stringify(nextDepartments));
  }

  return nextDepartments;
}
