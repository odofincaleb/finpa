import type { Transaction, TransactionType } from "../types";
import { resolveCategory } from "./resolveCategory";

/** Lightweight offline parser for Expo Go / unreachable API demos. */
export function parseExpenseLocally(
  message: string,
  userId: string,
  currency: string,
  categories: string[] = [],
): { summary: string; transactions: Transaction[] } | null {
  const text = message.trim();
  if (!text) return null;

  const income =
    /\b(received|earned|got paid|salary|income|credit)\b/i.test(text) ||
    /^\s*(received|earned)\b/i.test(text);
  const amountMatch = text.match(/[₦$€£]?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const type: TransactionType = income ? "income" : "expense";
  const category =
    type === "income"
      ? "Income"
      : resolveCategory(text, "Other", categories);

  const merchantMatch =
    text.match(/\bat\s+([A-Za-z0-9 &.'-]{2,40})/i) ||
    text.match(/\b(?:on|for)\s+([A-Za-z0-9 &.'-]{2,40})/i);
  const merchant = (merchantMatch?.[1] || category).trim().replace(/[.,!?]+$/, "");

  const tx: Transaction = {
    id: `local-${Date.now()}`,
    user_id: userId,
    amount,
    currency,
    category,
    merchant,
    type,
    payment_method: /transfer|pos|cash|card|visa|verve/i.exec(text)?.[0] || "",
    notes: text,
    created_at: new Date().toISOString(),
  };

  const summary =
    type === "income"
      ? `Logged ${currency} ${amount} under Income (offline demo)`
      : `Logged ${currency} ${amount} under ${category} (offline demo)`;

  return { summary, transactions: [tx] };
}
