const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Keeps a YYYY-MM filter value in the standard numeric reporting-month format. */
export function formatFilterMonth(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : value;
}

/** Formats month and full-date filter values as YYYY-MM without changing their filter value. */
export function formatStudioDateMonth(value: string): string {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:[T\s].*)?$/);
  const dayFirst = text.match(/^\d{1,2}[\/-](\d{1,2})[\/-](\d{4})(?:\s.*)?$/);
  const year = iso ? iso[1] : dayFirst?.[2];
  const month = Number(iso ? iso[2] : dayFirst?.[1]);
  return year && month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : value;
}

export function isDateFilterField(field: string): boolean {
  const normalized = field.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return /\b(date|dob|created on|added on|edited on|paid date|month)\b/i.test(normalized);
}

export function formatYearMonthFilterValue(field: string, value: string): string {
  return isDateFilterField(field) ? formatStudioDateMonth(value) : value;
}

/** Formats recognised calendar dates without changing the original table value. */
export function formatDisplayDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s.*)?$/);
  const parts = iso ? [Number(iso[3]), Number(iso[2]), Number(iso[1])] : slash ? [Number(slash[1]), Number(slash[2]), Number(slash[3])] : null;
  if (!parts) return null;
  const [day, month, year] = parts;
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${year}-${MONTHS[month - 1]}-${String(day).padStart(2, "0")}`;
}

export function formatTableValue(value: unknown, isDateColumn = false): string {
  if (value === null || value === undefined || value === "") return "—";
  const formatted = isDateColumn || typeof value === "string" ? formatDisplayDate(value) : null;
  return formatted ?? (typeof value === "object" ? JSON.stringify(value) : String(value));
}
