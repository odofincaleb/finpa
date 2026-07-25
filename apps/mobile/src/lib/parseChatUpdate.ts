import type { Transaction } from "../types";
import { formatMoney } from "./currency";

const UPDATE_INTENT =
  /\b(change|update|move|recategoris|recategoriz|correct|switch|fix|put)\b/i;

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
  "categories",
  "entry",
  "transaction",
  "transactions",
  "should",
  "be",
  "please",
  "can",
  "you",
  "and",
  "for",
  "on",
  "of",
  "a",
  "an",
  "my",
  "it",
  "its",
  "wrong",
  "right",
  "instead",
]);

function isUpdateIntent(text: string): boolean {
  const lower = text.toLowerCase();
  if (UPDATE_INTENT.test(text)) return true;
  if (/\b(should be|to category|under category)\b/i.test(text)) return true;
  if (/\bto\s+[A-Za-z][\w\s&/-]{1,40}\s*$/i.test(text) && /\b(other|fees|spent|purchase|entry)\b/i.test(text)) {
    return true;
  }
  // "school fees category School" / "make it School"
  if (/\bmake\s+it\b/i.test(text)) return true;
  if (lower.includes("category") && /\bto\b/.test(lower)) return true;
  return false;
}

function resolveTargetCategory(
  text: string,
  categories: string[],
): string | null {
  const sorted = [...categories]
    .filter((c) => c.toLowerCase() !== "income")
    .sort((a, b) => b.length - a.length);

  const patterns = [
    /\b(?:to|under|into|as)\s+(?:the\s+)?(?:category\s+)?["']?([A-Za-z][\w\s&/-]{0,40}?)["']?\s*$/i,
    /\bcategory\s+(?:to\s+|as\s+)?["']?([A-Za-z][\w\s&/-]{1,40})["']?/i,
    /\bmake\s+it\s+["']?([A-Za-z][\w\s&/-]{1,40})["']?/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const candidate = m[1].trim().replace(/[.,!?]+$/, "");
    const exact = sorted.find(
      (c) => c.toLowerCase() === candidate.toLowerCase(),
    );
    if (exact) return exact;
    const partial = sorted.find(
      (c) =>
        c.toLowerCase().includes(candidate.toLowerCase()) ||
        candidate.toLowerCase().includes(c.toLowerCase()),
    );
    if (partial) return partial;
  }

  const lower = text.toLowerCase();
  // Prefer category mentioned after "to "
  const toIdx = lower.lastIndexOf(" to ");
  if (toIdx >= 0) {
    const after = text.slice(toIdx + 4).trim().replace(/[.,!?]+$/, "");
    const exact = sorted.find(
      (c) => c.toLowerCase() === after.toLowerCase(),
    );
    if (exact) return exact;
  }

  return null;
}

function scoreMatch(
  tx: Transaction,
  text: string,
  words: string[],
  targetCategory: string,
): number {
  const hay = `${tx.notes} ${tx.merchant} ${tx.category}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (hay.includes(w)) score += w.length >= 5 ? 3 : 2;
  }
  // Prefer still-wrong rows (esp. Other) over ones already in the destination
  if (tx.category.toLowerCase() === targetCategory.toLowerCase()) {
    score -= 6;
  }
  if (tx.category.toLowerCase() === "other") {
    score += 4;
  }
  if (/\bother\b/i.test(text) && tx.category.toLowerCase() === "other") {
    score += 2;
  }
  return score;
}

function findTarget(
  text: string,
  transactions: Transaction[],
  targetCategory: string,
): Transaction | null {
  const expenses = transactions.filter((t) => t.type === "expense");
  if (!expenses.length) return null;

  const amountMatch = text.match(/[₦$€£]?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (amountMatch) {
    const amount = Number(amountMatch[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) {
      const byAmount = expenses.find(
        (t) =>
          Math.abs(Number(t.amount) - amount) < 0.021 &&
          t.category.toLowerCase() !== targetCategory.toLowerCase(),
      );
      if (byAmount) return byAmount;
      const anyAmount = expenses.find(
        (t) => Math.abs(Number(t.amount) - amount) < 0.021,
      );
      if (anyAmount) return anyAmount;
    }
  }

  const lower = text.toLowerCase();
  const targetLower = targetCategory.toLowerCase();
  const words = lower
    .split(/[^a-z0-9]+/)
    .filter(
      (w) => w.length >= 3 && !STOP.has(w) && w !== targetLower,
    );

  let best: { tx: Transaction; score: number } | null = null;
  for (const tx of expenses.slice(0, 40)) {
    const score = scoreMatch(tx, text, words, targetCategory);
    if (score > 0 && (!best || score > best.score)) {
      best = { tx, score };
    }
  }
  if (best && best.score >= 2) return best.tx;

  if (/\b(that|last|this|it)\b/i.test(text)) {
    const other = expenses.find((t) => t.category.toLowerCase() === "other");
    if (other) return other;
    const notTarget = expenses.find(
      (t) => t.category.toLowerCase() !== targetLower,
    );
    return notTarget || expenses[0];
  }

  return best?.tx ?? null;
}

/**
 * Local category / field corrections for chat (works for AsyncStorage-only txs).
 */
export function parseChatUpdate(
  message: string,
  transactions: Transaction[],
  categories: string[],
): { summary: string; transaction: Transaction } | null {
  const text = message.trim();
  if (!text || !isUpdateIntent(text)) return null;

  const targetCategory = resolveTargetCategory(text, categories);
  if (!targetCategory) return null;

  const target = findTarget(text, transactions, targetCategory);
  if (!target) return null;

  if (target.category === targetCategory) {
    return {
      summary: `That entry is already under ${targetCategory}.`,
      transaction: target,
    };
  }

  const updated: Transaction = { ...target, category: targetCategory };
  const label = target.merchant || target.notes.slice(0, 40) || "entry";
  return {
    summary: `Moved ${formatMoney(Number(target.amount), target.currency)} (${label}) to ${targetCategory}.`,
    transaction: updated,
  };
}
