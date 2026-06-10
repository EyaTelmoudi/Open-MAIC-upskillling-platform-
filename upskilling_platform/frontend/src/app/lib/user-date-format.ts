"use client";

const USER_PREFERENCES_KEY = "sf_preferences";
const DEFAULT_USER_TIMEZONE = "Africa/Tunis";

type SavedPreferences = {
  timezone?: string;
};

function readSavedTimezone() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(USER_PREFERENCES_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedPreferences;
    return typeof parsed.timezone === "string" && parsed.timezone.trim()
      ? parsed.timezone.trim()
      : null;
  } catch {
    return null;
  }
}

function isValidIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseLegacyUtcOffset(value: string) {
  const match = value.match(/^UTC([+-])(\d{2}):(\d{2})$/i);
  if (!match) return null;

  const [, sign, hoursText, minutesText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const offsetMinutes = hours * 60 + minutes;
  return sign === "+" ? offsetMinutes : -offsetMinutes;
}

function resolveTimezone(value: string | null | undefined) {
  if (!value) return null;

  if (isValidIanaTimezone(value)) {
    return { kind: "iana" as const, value };
  }

  const legacyOffsetMinutes = parseLegacyUtcOffset(value);
  if (legacyOffsetMinutes !== null) {
    return { kind: "offset" as const, value: legacyOffsetMinutes };
  }

  return null;
}

function resolvePreferredTimezone(explicitTimezone?: string | null) {
  return (
    resolveTimezone(explicitTimezone) ??
    resolveTimezone(readSavedTimezone()) ??
    resolveTimezone(
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : null,
    ) ??
    resolveTimezone(DEFAULT_USER_TIMEZONE)
  );
}

function formatWithUtcOffset(date: Date, offsetMinutes: number) {
  const shiftedDate = new Date(date.getTime() + offsetMinutes * 60_000);
  return shiftedDate.toLocaleString(undefined, { timeZone: "UTC" });
}

function formatDateOnlyWithUtcOffset(date: Date, offsetMinutes: number) {
  const shiftedDate = new Date(date.getTime() + offsetMinutes * 60_000);
  return shiftedDate.toLocaleDateString(undefined, { timeZone: "UTC" });
}

function parseDateForUserDisplay(value: string) {
  const trimmed = value.trim();
  const hasTime = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(trimmed);
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalizedValue =
    hasTime && !hasExplicitTimezone ? `${trimmed.replace(" ", "T")}Z` : trimmed;

  return new Date(normalizedValue);
}

export function formatDateForUser(value?: string | null, explicitTimezone?: string | null) {
  if (!value) return "-";

  const date = parseDateForUserDisplay(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const preferredTimezone = resolvePreferredTimezone(explicitTimezone);
  if (!preferredTimezone) {
    return date.toLocaleString();
  }

  if (preferredTimezone.kind === "iana") {
    return date.toLocaleString(undefined, { timeZone: preferredTimezone.value });
  }

  return formatWithUtcOffset(date, preferredTimezone.value);
}

export function formatDateOnlyForUser(value?: string | null, explicitTimezone?: string | null) {
  if (!value) return "-";

  const date = parseDateForUserDisplay(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const preferredTimezone = resolvePreferredTimezone(explicitTimezone);
  if (!preferredTimezone) {
    return date.toLocaleDateString();
  }

  if (preferredTimezone.kind === "iana") {
    return date.toLocaleDateString(undefined, { timeZone: preferredTimezone.value });
  }

  return formatDateOnlyWithUtcOffset(date, preferredTimezone.value);
}
