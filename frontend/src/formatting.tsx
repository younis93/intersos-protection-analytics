
export const formatNumber = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export const formatPercent = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(n);

/** Keeps stored project values intact while using the concise name in the UI. */
export const formatProjectLabel = (value: string) =>
  value.replace(/^UNHCR\s+2026\s*-\s*/i, "").trim() || value;

/** Keeps filter values unchanged while omitting Arabic location translations in the UI. */
export const formatProjectLocationLabel = (value: string) =>
  value.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, "").replace(/\s{2,}/g, " ").trim() || value;
