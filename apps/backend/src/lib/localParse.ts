import { resolveCategory } from "./resolveCategory";
import type { CurrencyCode, TransactionExtract } from "../types/transaction";

/** Deterministic parser when OpenRouter is down / rate-limited. */
export function parseExpenseLocally(
  message: string,
  preferredCurrency: CurrencyCode,
  categories: string[] = [],
): { summary: string; items: TransactionExtract[] } | null {
  const text = message.trim();
  if (!text) return null;

  const income =
    /\b(received|earned|got paid|salary|income|credit)\b/i.test(text) ||
    /^\s*(received|earned)\b/i.test(text);
  const amountMatch = text.match(/[₦$€£]?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const type: "income" | "expense" = income ? "income" : "expense";
  const category = resolveCategory(text, "Other", categories, type);

  const merchantMatch =
    text.match(/\bat\s+([A-Za-z0-9 &.'-]{2,40})/i) ||
    text.match(/\b(?:on|for)\s+([A-Za-z0-9 &.'-]{2,40})/i);
  const merchant = (merchantMatch?.[1] || category)
    .trim()
    .replace(/[.,!?]+$/, "");

  const item: TransactionExtract = {
    amount,
    currency: preferredCurrency,
    category,
    merchant,
    type,
    payment_method: /transfer|pos|cash|card|visa|verve/i.exec(text)?.[0] || "",
    notes: text,
  };

  const summary =
    type === "income"
      ? `Logged ${preferredCurrency} ${amount} under Income`
      : `Logged ${preferredCurrency} ${amount} under ${category}`;

  return { summary, items: [item] };
}
