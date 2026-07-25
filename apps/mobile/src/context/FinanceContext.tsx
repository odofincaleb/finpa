import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchBudgets, fetchTransactions, saveBudgets } from "../lib/api";
import { useAuth } from "./AuthContext";
import {
  CATEGORIES,
  type BudgetActualRow,
  type Transaction,
} from "../types";

const TX_KEY = "finpa.tx";
const CUSTOM_CAT_KEY = "finpa.customCategories";
const budgetKey = (year: number, month: number) =>
  `finpa.budgets.${year}-${String(month).padStart(2, "0")}`;

const DEFAULT_EXPENSE = CATEGORIES.filter((c) => c !== "Income");

function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function buildCategoryList(
  custom: string[],
  extras: string[] = [],
): string[] {
  const set = new Set<string>();
  for (const c of DEFAULT_EXPENSE) set.add(c);
  for (const c of custom) {
    const n = normalizeCategoryName(c);
    if (n && n.toLowerCase() !== "income") set.add(n);
  }
  for (const c of extras) {
    const n = normalizeCategoryName(c);
    if (n && n.toLowerCase() !== "income") set.add(n);
  }
  return Array.from(set);
}

function seedBudgetRows(
  currency: string,
  categoryList: string[],
  partial?: BudgetActualRow[],
): BudgetActualRow[] {
  const map = new Map((partial ?? []).map((r) => [r.category, r]));
  const names = buildCategoryList([], [
    ...categoryList,
    ...Array.from(map.keys()),
  ]);
  return names.map((category) => {
    const prev = map.get(category);
    return {
      category,
      budget_amount: Number(prev?.budget_amount ?? 0),
      actual_amount: Number(prev?.actual_amount ?? 0),
      remaining: Number(prev?.budget_amount ?? 0) - Number(prev?.actual_amount ?? 0),
      currency: prev?.currency ?? currency,
    };
  });
}

function recomputeActuals(
  budgetRows: BudgetActualRow[],
  transactions: Transaction[],
  year: number,
  month: number,
  currency: string,
  customCategories: string[],
): { rows: BudgetActualRow[]; incomeTotal: number } {
  const start = new Date(year, month - 1, 1).getTime();
  const end = new Date(year, month, 1).getTime();

  const actualByCategory = new Map<string, number>();
  let incomeTotal = 0;

  for (const t of transactions) {
    const ts = new Date(t.created_at).getTime();
    if (ts < start || ts >= end) continue;
    if (t.type === "income") {
      incomeTotal += Number(t.amount);
      continue;
    }
    actualByCategory.set(
      t.category,
      (actualByCategory.get(t.category) ?? 0) + Number(t.amount),
    );
  }

  const categoryList = buildCategoryList(customCategories, [
    ...budgetRows.map((r) => r.category),
    ...Array.from(actualByCategory.keys()),
  ]);

  const rows = seedBudgetRows(currency, categoryList, budgetRows).map((row) => {
    const actual_amount = actualByCategory.get(row.category) ?? 0;
    return {
      ...row,
      actual_amount,
      remaining: Number(row.budget_amount) - actual_amount,
      currency: row.currency || currency,
    };
  });

  return { rows, incomeTotal };
}

type FinanceContextValue = {
  transactions: Transaction[];
  budgetRows: BudgetActualRow[];
  incomeTotal: number;
  expenseCategories: string[];
  loadingTx: boolean;
  loadingBudgets: boolean;
  refreshTick: number;
  refresh: () => Promise<void>;
  addTransactions: (rows: Transaction[]) => void;
  mergeOptimistic: (rows: Transaction[]) => void;
  upsertBudget: (category: string, amount: number) => Promise<void>;
  addCategory: (name: string) => Promise<{ ok: boolean; error?: string }>;
  refreshBudgets: () => Promise<void>;
  getBudgetsForMonth: (year: number, month: number) => Promise<BudgetActualRow[]>;
  totalBudget: number;
  totalActual: number;
  remaining: number;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const { token, profile } = useAuth();
  const currency = profile?.preferred_currency ?? "NGN";
  const userId = profile?.id ?? "demo";

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetBase, setBudgetBase] = useState<BudgetActualRow[]>(() =>
    seedBudgetRows(currency, DEFAULT_EXPENSE as unknown as string[]),
  );
  const [loadingTx, setLoadingTx] = useState(true);
  const [loadingBudgets, setLoadingBudgets] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const expenseCategories = useMemo(
    () =>
      buildCategoryList(customCategories, budgetBase.map((r) => r.category)),
    [customCategories, budgetBase],
  );

  const { rows: budgetRows, incomeTotal } = useMemo(
    () =>
      recomputeActuals(
        budgetBase,
        transactions,
        year,
        month,
        currency,
        customCategories,
      ),
    [budgetBase, transactions, year, month, currency, customCategories],
  );

  const persistTx = useCallback(async (rows: Transaction[]) => {
    try {
      await AsyncStorage.setItem(TX_KEY, JSON.stringify(rows));
    } catch {
      // ignore
    }
  }, []);

  const persistCustomCategories = useCallback(async (cats: string[]) => {
    try {
      await AsyncStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(cats));
    } catch {
      // ignore
    }
  }, []);

  const persistBudgets = useCallback(
    async (rows: BudgetActualRow[], y: number, m: number) => {
      try {
        const slim = rows.map((r) => ({
          category: r.category,
          budget_amount: r.budget_amount,
          currency: r.currency,
        }));
        await AsyncStorage.setItem(budgetKey(y, m), JSON.stringify(slim));
      } catch {
        // ignore
      }
    },
    [],
  );

  const loadLocalTx = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(TX_KEY);
      if (!raw) return [] as Transaction[];
      return JSON.parse(raw) as Transaction[];
    } catch {
      return [];
    }
  }, []);

  const loadCustomCategories = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(CUSTOM_CAT_KEY);
      if (!raw) return [] as string[];
      const parsed = JSON.parse(raw) as string[];
      return parsed.map(normalizeCategoryName).filter(Boolean);
    } catch {
      return [];
    }
  }, []);

  const loadLocalBudgets = useCallback(
    async (customs: string[]) => {
      try {
        const raw = await AsyncStorage.getItem(budgetKey(year, month));
        const list = buildCategoryList(customs);
        if (!raw) return seedBudgetRows(currency, list);
        const parsed = JSON.parse(raw) as Array<{
          category: string;
          budget_amount: number;
          currency?: string;
        }>;
        return seedBudgetRows(
          currency,
          list,
          parsed.map((p) => ({
            category: p.category,
            budget_amount: p.budget_amount,
            actual_amount: 0,
            remaining: p.budget_amount,
            currency: p.currency ?? currency,
          })),
        );
      } catch {
        return seedBudgetRows(currency, buildCategoryList(customs));
      }
    },
    [year, month, currency],
  );

  const refresh = useCallback(async () => {
    if (!token) {
      setLoadingTx(false);
      setLoadingBudgets(false);
      return;
    }

    setLoadingTx(true);
    setLoadingBudgets(true);

    const customs = await loadCustomCategories();
    setCustomCategories(customs);

    let nextTx: Transaction[] = [];
    let nextBudgets = seedBudgetRows(currency, buildCategoryList(customs));

    try {
      const { transactions: remote } = await fetchTransactions(token);
      nextTx = remote;
    } catch {
      nextTx = await loadLocalTx();
    }

    try {
      const data = await fetchBudgets(token, year, month);
      nextBudgets = seedBudgetRows(
        currency,
        buildCategoryList(customs, data.rows.map((r) => r.category)),
        data.rows,
      );
    } catch {
      nextBudgets = await loadLocalBudgets(customs);
    }

    const local = await loadLocalTx();
    const remoteIds = new Set(nextTx.map((t) => t.id));
    const localOnly = local.filter(
      (t) => t.id.startsWith("local-") || !remoteIds.has(t.id),
    );
    const mergedMap = new Map<string, Transaction>();
    for (const t of nextTx) mergedMap.set(t.id, t);
    for (const t of localOnly) {
      if (!mergedMap.has(t.id)) mergedMap.set(t.id, t);
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );

    setTransactions(merged);
    setBudgetBase(nextBudgets);
    await persistTx(merged);
    await persistBudgets(nextBudgets, year, month);
    setRefreshTick((n) => n + 1);
    setLoadingTx(false);
    setLoadingBudgets(false);
  }, [
    token,
    currency,
    year,
    month,
    loadLocalTx,
    loadLocalBudgets,
    loadCustomCategories,
    persistTx,
    persistBudgets,
  ]);

  useEffect(() => {
    refresh().catch(() => {
      setLoadingTx(false);
      setLoadingBudgets(false);
    });
  }, [refresh, userId]);

  const addTransactions = useCallback(
    (rows: Transaction[]) => {
      if (!rows.length) return;
      setTransactions((prev) => {
        const ids = new Set(rows.map((r) => r.id));
        const rest = prev.filter((p) => !ids.has(p.id));
        const next = [...rows, ...rest].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
        void persistTx(next);
        return next;
      });
      // Ensure expense categories from new txs appear in budget table
      const newCats = rows
        .filter((r) => r.type === "expense")
        .map((r) => normalizeCategoryName(String(r.category)))
        .filter(Boolean);
      if (newCats.length) {
        setBudgetBase((prev) =>
          seedBudgetRows(
            currency,
            buildCategoryList(customCategories, [
              ...prev.map((p) => p.category),
              ...newCats,
            ]),
            prev,
          ),
        );
      }
      setRefreshTick((n) => n + 1);
    },
    [persistTx, currency, customCategories],
  );

  const addCategory = useCallback(
    async (name: string) => {
      const normalized = normalizeCategoryName(name);
      if (!normalized) return { ok: false, error: "Enter a category name" };
      if (normalized.toLowerCase() === "income") {
        return { ok: false, error: "Income is reserved" };
      }
      const exists = expenseCategories.some(
        (c) => c.toLowerCase() === normalized.toLowerCase(),
      );
      if (exists) return { ok: false, error: "Category already exists" };

      const nextCustom = [...customCategories, normalized];
      setCustomCategories(nextCustom);
      await persistCustomCategories(nextCustom);

      const nextRows = seedBudgetRows(
        currency,
        buildCategoryList(nextCustom, budgetBase.map((r) => r.category)),
        [
          ...budgetBase,
          {
            category: normalized,
            budget_amount: 0,
            actual_amount: 0,
            remaining: 0,
            currency,
          },
        ],
      );
      setBudgetBase(nextRows);
      await persistBudgets(nextRows, year, month);
      setRefreshTick((n) => n + 1);
      return { ok: true };
    },
    [
      expenseCategories,
      customCategories,
      currency,
      budgetBase,
      year,
      month,
      persistCustomCategories,
      persistBudgets,
    ],
  );

  const upsertBudget = useCallback(
    async (category: string, amount: number) => {
      const cat = normalizeCategoryName(category);
      const nextRows = seedBudgetRows(
        currency,
        buildCategoryList(customCategories, [
          ...budgetBase.map((r) => r.category),
          cat,
        ]),
        budgetBase,
      ).map((r) =>
        r.category === cat
          ? {
              ...r,
              budget_amount: amount,
              remaining: amount - r.actual_amount,
            }
          : r,
      );
      setBudgetBase(nextRows);
      await persistBudgets(nextRows, year, month);

      if (token) {
        try {
          const items = nextRows.map((r) => ({
            category: r.category,
            budget_amount: Number(r.budget_amount),
          }));
          const data = await saveBudgets(token, year, month, items);
          const seeded = seedBudgetRows(
            currency,
            buildCategoryList(customCategories, data.rows.map((r) => r.category)),
            data.rows,
          );
          setBudgetBase(seeded);
          await persistBudgets(seeded, year, month);
        } catch {
          // keep local
        }
      }

      setRefreshTick((n) => n + 1);
    },
    [
      budgetBase,
      customCategories,
      currency,
      year,
      month,
      token,
      persistBudgets,
    ],
  );

  const refreshBudgets = useCallback(async () => {
    const customs = await loadCustomCategories();
    setCustomCategories(customs);
    if (!token) {
      const local = await loadLocalBudgets(customs);
      setBudgetBase(local);
      return;
    }
    try {
      const data = await fetchBudgets(token, year, month);
      const seeded = seedBudgetRows(
        currency,
        buildCategoryList(customs, data.rows.map((r) => r.category)),
        data.rows,
      );
      setBudgetBase(seeded);
      await persistBudgets(seeded, year, month);
    } catch {
      const local = await loadLocalBudgets(customs);
      setBudgetBase(local);
    }
    setRefreshTick((n) => n + 1);
  }, [
    token,
    year,
    month,
    currency,
    loadLocalBudgets,
    loadCustomCategories,
    persistBudgets,
  ]);

  const getBudgetsForMonth = useCallback(
    async (y: number, m: number): Promise<BudgetActualRow[]> => {
      if (y === year && m === month) return budgetRows;

      let base: BudgetActualRow[];
      try {
        const raw = await AsyncStorage.getItem(budgetKey(y, m));
        const list = buildCategoryList(customCategories);
        if (!raw) {
          base = seedBudgetRows(currency, list);
        } else {
          const parsed = JSON.parse(raw) as Array<{
            category: string;
            budget_amount: number;
            currency?: string;
          }>;
          base = seedBudgetRows(
            currency,
            list,
            parsed.map((p) => ({
              category: p.category,
              budget_amount: p.budget_amount,
              actual_amount: 0,
              remaining: p.budget_amount,
              currency: p.currency ?? currency,
            })),
          );
        }
      } catch {
        base = seedBudgetRows(currency, buildCategoryList(customCategories));
      }

      return recomputeActuals(
        base,
        transactions,
        y,
        m,
        currency,
        customCategories,
      ).rows;
    },
    [year, month, budgetRows, customCategories, currency, transactions],
  );

  const totalBudget = budgetRows.reduce((s, r) => s + Number(r.budget_amount), 0);
  const totalActual = budgetRows.reduce((s, r) => s + Number(r.actual_amount), 0);

  const value = useMemo<FinanceContextValue>(
    () => ({
      transactions,
      budgetRows,
      incomeTotal,
      expenseCategories,
      loadingTx,
      loadingBudgets,
      refreshTick,
      refresh,
      addTransactions,
      mergeOptimistic: addTransactions,
      upsertBudget,
      addCategory,
      refreshBudgets,
      getBudgetsForMonth,
      totalBudget,
      totalActual,
      remaining: totalBudget - totalActual,
    }),
    [
      transactions,
      budgetRows,
      incomeTotal,
      expenseCategories,
      loadingTx,
      loadingBudgets,
      refreshTick,
      refresh,
      addTransactions,
      upsertBudget,
      addCategory,
      refreshBudgets,
      getBudgetsForMonth,
      totalBudget,
      totalActual,
    ],
  );

  return (
    <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used within FinanceProvider");
  return ctx;
}
