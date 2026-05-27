export const TSHIRTS_SHOP_ID = "tshirts";
export const TSHIRTS_SHOP_NAME = "Nirvana Tees";

/** Canonical inventory categories for this revenue stream — prefer these exact strings in the DB. */
export const TEE_CATEGORY_PLAIN = "Plain T-Shirt";
export const TEE_CATEGORY_GOLF = "Plain Golf T-Shirt";

export type TeeProductLine = "plain" | "golf" | "unknown";

export const TEE_LINE_LABELS: Record<Exclude<TeeProductLine, "unknown">, string> = {
  plain: "Plain T-Shirt",
  golf: "Plain Golf T-Shirt",
};

/** Lowercase, single spaces (for readable compare). */
function normalizedCategory(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Letters and digits only — “Plain T-Shirt”, “Plain T Shirt”, “plain tshirt” → same slug. */
function slugCategory(s: string): string {
  return normalizedCategory(s).replace(/[^a-z0-9]/g, "");
}

const PLAIN_SLUG = slugCategory(TEE_CATEGORY_PLAIN);
const GOLF_SLUG = slugCategory(TEE_CATEGORY_GOLF);

/**
 * Classifies a product into Plain T-Shirt vs Plain Golf T-Shirt.
 * Accepts canonical categories plus common typos (extra spaces, missing hyphen).
 * Only these two lines are tracked on the Nirvana Tees stream.
 */
export function classifyTeeLine(item: {
  category?: string | null;
  name?: string | null;
}): TeeProductLine {
  const catRaw = String(item.category || "").trim();
  const cat = normalizedCategory(catRaw);
  const catSlug = slugCategory(catRaw);
  const name = String(item.name || "").trim().toLowerCase();
  const hasCategory = Boolean(catRaw);

  const slugMatchesGolf = catSlug === GOLF_SLUG;

  const isGolf =
    slugMatchesGolf ||
    normalizedCategory(TEE_CATEGORY_GOLF) === cat ||
    (cat.includes("golf") &&
      (cat.includes("shirt") || cat.includes("tee") || cat.includes("tshirt"))) ||
    (!hasCategory &&
      (/\bgolf\b/.test(name) &&
        (/\bshirt\b/.test(name) || /\bt-?shirt\b/.test(name) || /\btee\b/.test(name))));

  if (isGolf) return "golf";

  const slugMatchesPlain = catSlug === PLAIN_SLUG;

  const isPlain =
    slugMatchesPlain ||
    normalizedCategory(TEE_CATEGORY_PLAIN) === cat ||
    (cat.includes("plain") &&
      (cat.includes("t-shirt") ||
        cat.includes("tshirt") ||
        cat.includes("tee") ||
        cat.includes("shirt")) &&
      !cat.includes("golf")) ||
    (!hasCategory &&
      (/\bplain\b/.test(name) &&
        (/\bt-?shirt\b/.test(name) || /\btee\b/.test(name)) &&
        !/\bgolf\b/.test(name)));

  if (isPlain) return "plain";

  return "unknown";
}

export function teeLineLabel(line: TeeProductLine): string {
  if (line === "plain") return TEE_LINE_LABELS.plain;
  if (line === "golf") return TEE_LINE_LABELS.golf;
  return "Unclassified";
}

/** Only Plain T-Shirt and Plain Golf T-Shirt belong on this shop. */
export function isNirvanaTeeItem(item: {
  category?: string | null;
  name?: string | null;
}): boolean {
  return classifyTeeLine(item) !== "unknown";
}

/** @deprecated Use isNirvanaTeeItem */
export function isTshirtItem(item: {
  category?: string | null;
  name?: string | null;
}): boolean {
  return isNirvanaTeeItem(item);
}

export function shopAllocationQty(
  item: { allocations?: { shopId: string; quantity: number }[] },
  shopId: string = TSHIRTS_SHOP_ID
): number {
  const alloc = (item.allocations || []).find((a) => a.shopId === shopId);
  return Number(alloc?.quantity ?? 0);
}
