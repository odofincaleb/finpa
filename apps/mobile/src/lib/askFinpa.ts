import type { BudgetActualRow } from "../types";
import { formatMoney } from "./currency";
import { resolveCategory } from "./resolveCategory";

export type AskFinpaContext = {
  currency: string;
  incomeTotal: number;
  totalBudget: number;
  totalActual: number;
  remaining: number;
  budgetRows: BudgetActualRow[];
  expenseCategories: string[];
};

function parseAmount(text: string): number | null {
  const m = text.match(/[₦$€£]?\s*([\d,]+(?:\.\d{1,2})?)\s*(k\b)?/i);
  if (!m) return null;
  let amount = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (m[2]) amount *= 1000;
  return amount;
}

function findCategory(
  text: string,
  categories: string[],
  budgetRows: BudgetActualRow[],
): string | null {
  const lower = text.toLowerCase();
  const sorted = [...categories].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    if (c.toLowerCase() === "other") continue;
    if (lower.includes(c.toLowerCase())) return c;
  }
  // Soft resolve from keywords (school fees → School)
  const guessed = resolveCategory(text, "", categories);
  if (guessed && guessed !== "Other") return guessed;

  for (const row of budgetRows) {
    if (row.budget_amount > 0 && lower.includes(row.category.toLowerCase())) {
      return row.category;
    }
  }
  return null;
}

function isAskIntent(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /\b(can i afford|could i afford|afford|do i have enough|is it ok to (buy|spend)|should i (buy|spend))\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /\b(how much (left|remain|do i have)|what'?s left|remaining|budget (left|status)|how am i doing|am i over)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(how much (have i |did i )?spent|spending (so far|this month))\b/i.test(text)) {
    return true;
  }
  // Question mark + money / budget words
  if (text.includes("?") && /\b(budget|left|afford|spend|spent|category)\b/i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Local Ask FINPA answers — no AI call. Returns null if not a Q&A message.
 */
export function answerAskFinpa(
  message: string,
  ctx: AskFinpaContext,
): string | null {
  const text = message.trim();
  if (!text || !isAskIntent(text)) return null;

  const { currency, incomeTotal, totalBudget, totalActual, remaining, budgetRows, expenseCategories } =
    ctx;
  const netCash = incomeTotal - totalActual;
  const amount = parseAmount(text);
  const category = findCategory(text, expenseCategories, budgetRows);
  const catRow = category
    ? budgetRows.find((r) => r.category.toLowerCase() === category.toLowerCase())
    : undefined;

  // Affordability
  if (
    /\b(afford|enough|ok to (buy|spend)|should i (buy|spend))\b/i.test(text) &&
    amount != null
  ) {
    const catLeft = catRow ? Number(catRow.remaining) : null;
    const overallLeft = remaining;
    const parts: string[] = [];

    if (catRow && Number(catRow.budget_amount) > 0 && catLeft != null) {
      if (amount <= catLeft) {
        parts.push(
          `Yes — ${formatMoney(amount, currency)} fits in ${catRow.category} (${formatMoney(catLeft, currency)} left of ${formatMoney(Number(catRow.budget_amount), currency)}).`,
        );
      } else if (catLeft > 0) {
        parts.push(
          `Tight — ${catRow.category} only has ${formatMoney(catLeft, currency)} left; you’d be ${formatMoney(amount - catLeft, currency)} over that category.`,
        );
      } else {
        parts.push(
          `No — ${catRow.category} is already ${formatMoney(Math.abs(catLeft), currency)} over budget.`,
        );
      }
    } else if (totalBudget > 0) {
      if (amount <= overallLeft) {
        parts.push(
          `Yes on overall budget — ${formatMoney(amount, currency)} is within ${formatMoney(Math.max(overallLeft, 0), currency)} left this month.`,
        );
      } else {
        parts.push(
          `Stretch — overall budget only has ${formatMoney(Math.max(overallLeft, 0), currency)} left; this is ${formatMoney(amount - Math.max(overallLeft, 0), currency)} over.`,
        );
      }
    } else {
      parts.push(
        totalBudget === 0
          ? `You haven’t set budgets yet. Based on logged income vs spend, net is ${formatMoney(netCash, currency)}.`
          : `Based on income vs spend, net is ${formatMoney(netCash, currency)}.`,
      );
    }

    if (incomeTotal > 0) {
      const after = netCash - amount;
      parts.push(
        after >= 0
          ? `After this, month net would be about ${formatMoney(after, currency)}.`
          : `After this, you’d be ${formatMoney(Math.abs(after), currency)} net negative vs logged income.`,
      );
    }

    return parts.join(" ");
  }

  // Category remaining
  if (category && catRow && /\b(left|remain|budget|how much)\b/i.test(text)) {
    const bud = Number(catRow.budget_amount);
    const spent = Number(catRow.actual_amount);
    const left = Number(catRow.remaining);
    if (bud <= 0) {
      return `${category}: spent ${formatMoney(spent, currency)} · no budget set yet.`;
    }
    return `${category}: ${formatMoney(Math.max(left, 0), currency)} left of ${formatMoney(bud, currency)} (${formatMoney(spent, currency)} spent${left < 0 ? `, ${formatMoney(Math.abs(left), currency)} over` : ""}).`;
  }

  // Overall status
  if (
    /\b(budget (left|status)|how am i doing|am i over|how much left|what'?s left|remaining)\b/i.test(
      text,
    ) ||
    (text.includes("?") && /\b(budget|left)\b/i.test(text))
  ) {
    const over = budgetRows.filter(
      (r) => Number(r.budget_amount) > 0 && Number(r.remaining) < 0,
    );
    const lines = [
      `This month: spent ${formatMoney(totalActual, currency)} of ${formatMoney(totalBudget, currency)} budget · ${formatMoney(Math.max(remaining, 0), currency)} left.`,
    ];
    if (incomeTotal > 0) {
      lines.push(
        `Income ${formatMoney(incomeTotal, currency)} · net ${formatMoney(netCash, currency)}.`,
      );
    }
    if (over.length) {
      lines.push(
        `${over.length} categor${over.length === 1 ? "y is" : "ies are"} over: ${over
          .slice(0, 3)
          .map((r) => r.category)
          .join(", ")}.`,
      );
    }
    return lines.join(" ");
  }

  // Spending so far
  if (/\b(spent|spending)\b/i.test(text) && amount == null) {
    if (category && catRow) {
      return `You’ve spent ${formatMoney(Number(catRow.actual_amount), currency)} on ${category} this month.`;
    }
    return `You’ve spent ${formatMoney(totalActual, currency)} this month${
      totalBudget > 0 ? ` of ${formatMoney(totalBudget, currency)} budgeted` : ""
    }.`;
  }

  // Afford without clear amount
  if (/\bafford\b/i.test(text) && amount == null) {
    return `Tell me the amount — e.g. “Can I afford ₦80,000 shoes?” or “Can I afford 50k on School?”`;
  }

  return null;
}
