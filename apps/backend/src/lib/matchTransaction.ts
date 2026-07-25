import type { TransactionRecord } from "../types/transaction";

const STOP = new Set([
  "change",
  "update",
  "move",
  "correct",
  "switch",
  "fix",
  "put",
  "that",
  "this",
  "the",
  "last",
  "to",
  "under",
  "into",
  "as",
  "from",
  "category",
  "entry",
  "transaction",
  "should",
  "be",
  "other",
  "and",
  "for",
  "on",
  "of",
  "a",
  "an",
]);

export function findMatchingTransaction(
  rows: TransactionRecord[],
  match: string,
  message?: string,
): TransactionRecord | null {
  if (!rows.length) return null;
  const haystack = `${match || ""} ${message || ""}`.trim();
  const lower = haystack.toLowerCase();
  const needle = (match || "").toLowerCase().trim();

  const amountMatch = haystack.match(/[₦$€£]?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (amountMatch) {
    const amount = Number(amountMatch[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) {
      const byAmount = rows.find(
        (r) => Math.abs(Number(r.amount) - amount) < 0.021,
      );
      if (byAmount) return byAmount;
    }
  }

  if (needle) {
    const exactish = rows.find(
      (r) =>
        r.merchant.toLowerCase().includes(needle) ||
        r.category.toLowerCase().includes(needle) ||
        r.notes.toLowerCase().includes(needle),
    );
    if (exactish) return exactish;
  }

  const words = lower
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));

  let best: { row: TransactionRecord; score: number } | null = null;
  for (const r of rows.slice(0, 40)) {
    const hay = `${r.notes} ${r.merchant} ${r.category}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (hay.includes(w)) score += w.length >= 5 ? 3 : 2;
    }
    if (/\bother\b/.test(lower) && r.category.toLowerCase() === "other") {
      score += 4;
    }
    if (score > 0 && (!best || score > best.score)) best = { row: r, score };
  }
  if (best && best.score >= 2) return best.row;

  if (/\b(that|last|this|it)\b/.test(lower)) {
    return (
      rows.find((r) => r.category.toLowerCase() === "other") || rows[0] || null
    );
  }

  return null;
}
