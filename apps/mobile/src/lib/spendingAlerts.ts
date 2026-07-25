import type { BudgetActualRow } from "../types";
import { formatMoney } from "./currency";

export type SpendingAlertLevel = "warn" | "over";

export type SpendingAlert = {
  id: string;
  category: string;
  level: SpendingAlertLevel;
  percent: number;
  spent: number;
  budget: number;
  remaining: number;
  message: string;
};

/** In-app alerts when a category hits 80% or 100% of its budget. */
export function computeSpendingAlerts(
  budgetRows: BudgetActualRow[],
  currency: string,
): SpendingAlert[] {
  const alerts: SpendingAlert[] = [];

  for (const row of budgetRows) {
    const budget = Number(row.budget_amount);
    const spent = Number(row.actual_amount);
    if (!(budget > 0) || !(spent > 0)) continue;

    const percent = Math.round((spent / budget) * 100);
    if (percent < 80) continue;

    const remaining = budget - spent;
    const level: SpendingAlertLevel = percent >= 100 ? "over" : "warn";
    const message =
      level === "over"
        ? `${row.category} is over budget by ${formatMoney(Math.abs(remaining), currency)} (${percent}%)`
        : `${row.category} is at ${percent}% of budget · ${formatMoney(Math.max(remaining, 0), currency)} left`;

    alerts.push({
      id: `${row.category}-${level}-${percent}`,
      category: row.category,
      level,
      percent,
      spent,
      budget,
      remaining,
      message,
    });
  }

  return alerts.sort((a, b) => {
    if (a.level !== b.level) return a.level === "over" ? -1 : 1;
    return b.percent - a.percent;
  });
}
