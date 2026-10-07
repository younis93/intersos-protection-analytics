export type TableValueAlignment = "left" | "center" | "right";

// Ignore whitespace, punctuation, and bidi controls before the actual value.
export function tableValueAlignment(value: string): TableValueAlignment {
  const first = value.match(/[\p{L}\p{N}]/u)?.[0];
  if (!first || /\p{N}/u.test(first)) return "center";
  return /\p{Script=Arabic}/u.test(first) ? "right" : "left";
}
