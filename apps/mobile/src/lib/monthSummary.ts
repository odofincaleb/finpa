import type { BudgetActualRow, Transaction } from "../types";
import { formatMoney } from "./currency";

export type CategorySpend = {
  category: string;
  amount: number;
  percent: number;
  budget: number;
  remaining: number;
};

export type MonthSummary = {
  year: number;
  month: number;
  income: number;
  expenses: number;
  net: number;
  totalBudget: number;
  budgetUsedPercent: number | null;
  byCategory: CategorySpend[];
  topCategories: CategorySpend[];
  insights: string[];
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function computeMonthSummary(
  transactions: Transaction[],
  budgetRows: BudgetActualRow[],
  year: number,
  month: number,
  currency: string,
): MonthSummary {
  const start = new Date(year, month - 1, 1).getTime();
  const end = new Date(year, month, 1).getTime();

  let income = 0;
  let expenses = 0;
  const spendMap = new Map<string, number>();

  for (const t of transactions) {
    const ts = new Date(t.created_at).getTime();
    if (ts < start || ts >= end) continue;
    const amount = Number(t.amount);
    if (t.type === "income") {
      income += amount;
    } else {
      expenses += amount;
      spendMap.set(t.category, (spendMap.get(t.category) ?? 0) + amount);
    }
  }

  const budgetMap = new Map(
    budgetRows.map((r) => [r.category, Number(r.budget_amount)]),
  );
  const totalBudget = budgetRows.reduce((s, r) => s + Number(r.budget_amount), 0);
  const net = income - expenses;
  const budgetUsedPercent =
    totalBudget > 0 ? Math.round((expenses / totalBudget) * 100) : null;

  const categories = new Set([
    ...Array.from(spendMap.keys()),
    ...budgetRows.filter((r) => r.budget_amount > 0 || (spendMap.get(r.category) ?? 0) > 0).map((r) => r.category),
  ]);

  const byCategory: CategorySpend[] = Array.from(categories)
    .map((category) => {
      const amount = spendMap.get(category) ?? 0;
      const budget = budgetMap.get(category) ?? 0;
      return {
        category,
        amount,
        percent: expenses > 0 ? Math.round((amount / expenses) * 100) : 0,
        budget,
        remaining: budget - amount,
      };
    })
    .filter((c) => c.amount > 0 || c.budget > 0)
    .sort((a, b) => b.amount - a.amount);

  const topCategories = byCategory.filter((c) => c.amount > 0).slice(0, 3);

  const insights: string[] = [];

  if (topCategories[0] && expenses > 0) {
    const top = topCategories[0];
    insights.push(
      `${top.category} is ${top.percent}% of spending this month (${formatMoney(top.amount, currency)})`,
    );
  }

  const overBudget = byCategory.filter((c) => c.budget > 0 && c.amount > c.budget);
  if (overBudget.length > 0) {
    insights.push(
      `${overBudget.length} categor${overBudget.length === 1 ? "y is" : "ies are"} over budget`,
    );
  }

  if (income > 0) {
    const savingsRate = Math.round((net / income) * 100);
    insights.push(
      net >= 0
        ? `Net savings rate: ${savingsRate}%`
        : `Spending exceeds income by ${formatMoney(Math.abs(net), currency)}`,
    );
  } else if (expenses > 0) {
    insights.push(`No income logged · expenses ${formatMoney(expenses, currency)}`);
  }

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  if (isCurrentMonth && totalBudget > 0 && expenses > 0) {
    const day = today.getDate();
    const dim = daysInMonth(year, month);
    const projected = (expenses / day) * dim;
    if (projected > totalBudget) {
      const over = projected - totalBudget;
      insights.push(
        `At this pace you’ll exceed budget by ~${formatMoney(over, currency)} before month end`,
      );
    } else {
      const left = totalBudget - expenses;
      insights.push(
        `${formatMoney(left, currency)} budget left with ${dim - day} day${dim - day === 1 ? "" : "s"} remaining`,
      );
    }
  }

  if (!insights.length) {
    insights.push("Log income and expenses to unlock smarter monthly insights.");
  }

  return {
    year,
    month,
    income,
    expenses,
    net,
    totalBudget,
    budgetUsedPercent,
    byCategory,
    topCategories,
    insights: insights.slice(0, 4),
  };
}
