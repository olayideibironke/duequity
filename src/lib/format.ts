/**
 * Formatting helpers.
 *
 * Monetary presentation is a compliance surface in Duequity, not a cosmetic one.
 * An estimated figure must never be able to read as a confirmed figure, so
 * currency formatting lives here and is used through the <Money> component
 * rather than being reimplemented per screen.
 *
 * Amounts are handled in whole cents as integers. Floating point dollars are not
 * acceptable for money that a claimant is owed.
 */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const plain = new Intl.NumberFormat("en-US");

/** Format integer cents as full currency, for example 4268000 to $42,680.00 */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Format integer cents with no decimals, for dense table and tile contexts. */
export function formatCentsWhole(cents: number): string {
  return usdWhole.format(cents / 100);
}

/** Compact currency for dashboard aggregates, for example $4.3M */
export function formatCentsCompact(cents: number): string {
  return compact.format(cents / 100);
}

/** Thousands separated integer. */
export function formatCount(value: number): string {
  return plain.format(value);
}

/** Percentage from a 0 to 1 ratio, for example 0.184 to 18.4% */
export function formatRatio(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * All domain dates are stored as ISO calendar dates (YYYY-MM-DD) with no time or
 * zone component. A filing deadline is a legal calendar date. Parsing it through
 * the Date constructor would shift it across a timezone boundary and could show
 * a claimant the wrong deadline, so the parts are read directly.
 */
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Validation-build business timezone for operational timestamps.
 *
 * Calendar dates such as claim deadlines never use this value. They remain
 * timezone-free legal dates and continue through formatDate().
 *
 * Production should ultimately derive an operator or organization timezone from
 * the authenticated session rather than assuming one timezone nationally.
 */
export const DEFAULT_BUSINESS_TIME_ZONE = "America/New_York";

function parseIsoDate(iso: string): {
  y: number;
  m: number;
  d: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);

  if (!match) {
    return null;
  }

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }

  return {
    y,
    m,
    d,
  };
}

/** 2026-03-14 to "Mar 14, 2026" */
export function formatDate(iso: string): string {
  const parts = parseIsoDate(iso);

  if (!parts) {
    return "Not recorded";
  }

  return `${MONTHS_SHORT[parts.m - 1]} ${parts.d}, ${parts.y}`;
}

/** 2026-03-14 to "March 14, 2026" */
export function formatDateLong(iso: string): string {
  const parts = parseIsoDate(iso);

  if (!parts) {
    return "Not recorded";
  }

  return `${MONTHS_LONG[parts.m - 1]} ${parts.d}, ${parts.y}`;
}

/** 2026-03-14 to "Mar 2026" */
export function formatMonthYear(iso: string): string {
  const parts = parseIsoDate(iso);

  if (!parts) {
    return "Not recorded";
  }

  return `${MONTHS_SHORT[parts.m - 1]} ${parts.y}`;
}

/**
 * Format a real timestamp as a business-calendar date.
 *
 * Unlike formatDate(), this function intentionally parses the instant and then
 * converts it into the requested timezone before choosing the displayed date.
 *
 * Example:
 *
 * 2026-08-18T00:54:01.326Z
 *
 * becomes Aug 17, 2026 in America/New_York because the approval occurred at
 * 8:54 PM Eastern on August 17.
 */
export function formatTimestampDate(
  iso: string,
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return "Not recorded";
  }
}

/**
 * Format a real timestamp with both business date and local clock time.
 *
 * Intended for audit trails, approval history and other operational event logs.
 * This is separate from legal calendar dates.
 */
export function formatTimestamp(
  iso: string,
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "Not recorded";
  }
}

/** Whole days from `from` to `to`. Negative means `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = parseIsoDate(from);

  const b = parseIsoDate(to);

  if (!a || !b) {
    return 0;
  }

  const utcA = Date.UTC(a.y, a.m - 1, a.d);

  const utcB = Date.UTC(b.y, b.m - 1, b.d);

  return Math.round((utcB - utcA) / 86_400_000);
}

/**
 * Human readable distance to a deadline, relative to a supplied reference date.
 *
 * The reference date is always passed in rather than read from the system clock.
 * That keeps server and client renders identical (no hydration mismatch) and
 * keeps deadline logic testable.
 */
export function describeDeadline(
  deadlineIso: string,
  todayIso: string,
): {
  label: string;
  days: number;
  severity: "expired" | "urgent" | "soon" | "clear";
} {
  const days = daysBetween(todayIso, deadlineIso);

  if (days < 0) {
    const past = Math.abs(days);

    return {
      label:
        past === 1
          ? "Passed yesterday"
          : `Passed ${formatCount(past)} days ago`,
      days,
      severity: "expired",
    };
  }

  if (days === 0) {
    return {
      label: "Due today",
      days,
      severity: "urgent",
    };
  }

  if (days === 1) {
    return {
      label: "1 day remaining",
      days,
      severity: "urgent",
    };
  }

  if (days <= 30) {
    return {
      label: `${days} days remaining`,
      days,
      severity: days <= 14 ? "urgent" : "soon",
    };
  }

  if (days <= 90) {
    return {
      label: `${days} days remaining`,
      days,
      severity: "soon",
    };
  }

  const months = Math.round(days / 30);

  return {
    label: `${months} months remaining`,
    days,
    severity: "clear",
  };
}

/** Relative elapsed label for activity feeds, again against a passed reference. */
export function formatElapsed(iso: string, todayIso: string): string {
  const days = daysBetween(iso, todayIso);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  if (days < 30) {
    const weeks = Math.round(days / 7);

    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }

  if (days < 365) {
    const months = Math.round(days / 30);

    return months === 1 ? "1 month ago" : `${months} months ago`;
  }

  return formatDate(iso);
}

/* -------------------------------------------------------------------------- */
/* Identity and contact presentation                                           */
/* -------------------------------------------------------------------------- */

/**
 * Public-facing partial address. Duequity discloses enough for a former owner to
 * recognise their own property while not publishing a complete record for
 * someone who has not yet verified their relationship to it.
 */
export function maskStreetAddress(line1: string): string {
  const trimmed = line1.trim();

  const firstSpace = trimmed.indexOf(" ");

  if (firstSpace < 1) {
    return trimmed;
  }

  const number = trimmed.slice(0, firstSpace);

  const rest = trimmed.slice(firstSpace + 1);

  const words = rest.split(/\s+/);

  const revealed = words[0] ?? "";

  return words.length > 1
    ? `${number} ${revealed} ...`
    : `${number} ${revealed}`;
}

/** Mask a name to initial plus last name, for privacy-preserving public results. */
export function maskPersonName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return `${parts[0][0]}.`;
  }

  const last = parts[parts.length - 1];

  return `${parts[0][0]}. ${last}`;
}

/** Format a 10 digit US phone number for display. */
export function formatPhone(digits: string): string {
  const clean = digits.replace(/\D/g, "");

  if (clean.length !== 10) {
    return digits;
  }

  return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
}

/** Human readable file size for the document surfaces. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Initials for avatar chips. Never more than two characters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Pluralise a countable noun without a leading count. */
export function plural(count: number, one: string, many?: string): string {
  return count === 1 ? one : (many ?? `${one}s`);
}
