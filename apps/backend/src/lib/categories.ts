import { CATEGORIES } from "../types/transaction";

const DEFAULT_EXPENSE = CATEGORIES.filter((c) => c !== "Income");

export function mergeExpenseCategories(extra?: string[]): string[] {
  const set = new Set<string>(DEFAULT_EXPENSE);
  for (const c of extra ?? []) {
    const name = String(c || "").trim().replace(/\s+/g, " ");
    if (!name || name.toLowerCase() === "income") continue;
    if (name.length > 64) continue;
    set.add(name);
  }
  if (!set.has("Other")) set.add("Other");
  return Array.from(set);
}

export function buildCategoryEnum(categories: string[]): string[] {
  const expense = mergeExpenseCategories(categories);
  return [...expense, "Income"];
}
