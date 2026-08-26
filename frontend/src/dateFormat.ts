const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Formats a YYYY-MM filter value as a readable reporting month. */
export function formatFilterMonth(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]} - ${MONTHS[month - 1]}` : value;
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
