import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import {
  createTransactionApi,
  deleteTransactionApi,
  fetchBudgets,
  fetchTransactions,
  saveBudgets,
  updateTransactionApi,
  type TransactionWriteInput,
} from "../lib/api";
import {
  enqueueSync,
  isLocalId,
  loadSyncQueue,
  saveSyncQueue,
  type SyncQueueItem,
} from "../lib/syncQueue";
import {
  budgetKey,
  customCategoriesKey,
  purgeLegacySharedFinanceKeys,
  txKey,
} from "../lib/userStorage";
import { useAuth } from "./AuthContext";
import {
  CATEGORIES,
  type BudgetActualRow,
  type Transaction,
  type TransactionType,
} from "../types";

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

export type ManualTransactionInput = {
  amount: number;
  type: TransactionType;
  category: string;
  merchant: string;
  payment_method: string;
  notes: string;
  created_at?: string;
};

type FinanceContextValue = {
  transactions: Transaction[];
  budgetRows: BudgetActualRow[];
  incomeTotal: number;
  expenseCategories: string[];
  loadingTx: boolean;
  loadingBudgets: boolean;
  refreshTick: number;
  isOnline: boolean;
  pendingSyncCount: number;
  refresh: () => Promise<void>;
  flushSyncQueue: () => Promise<void>;
  addTransactions: (rows: Transaction[]) => void;
  mergeOptimistic: (rows: Transaction[]) => void;
  createManualTransaction: (input: ManualTransactionInput) => Promise<Transaction>;
  updateTransaction: (
    id: string,
    patch: Partial<ManualTransactionInput>,
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
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
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const flushingRef = useRef(false);
  const idMapRef = useRef<Map<string, string>>(new Map());

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

  const persistTx = useCallback(
    async (rows: Transaction[]) => {
      if (!userId || userId === "demo") return;
      try {
        await AsyncStorage.setItem(txKey(userId), JSON.stringify(rows));
      } catch {
        // ignore
      }
    },
    [userId],
  );

  const persistCustomCategories = useCallback(
    async (cats: string[]) => {
      if (!userId || userId === "demo") return;
      try {
        await AsyncStorage.setItem(
          customCategoriesKey(userId),
          JSON.stringify(cats),
        );
      } catch {
        // ignore
      }
    },
    [userId],
  );

  const persistBudgets = useCallback(
    async (rows: BudgetActualRow[], y: number, m: number) => {
      if (!userId || userId === "demo") return;
      try {
        const slim = rows.map((r) => ({
          category: r.category,
          budget_amount: r.budget_amount,
          currency: r.currency,
        }));
        await AsyncStorage.setItem(
          budgetKey(userId, y, m),
          JSON.stringify(slim),
        );
      } catch {
        // ignore
      }
    },
    [userId],
  );

  const refreshPendingCount = useCallback(async () => {
    if (!userId || userId === "demo") {
      setPendingSyncCount(0);
      return;
    }
    const q = await loadSyncQueue(userId);
    setPendingSyncCount(q.length);
  }, [userId]);

  const loadLocalTx = useCallback(async () => {
    if (!userId || userId === "demo") return [] as Transaction[];
    try {
      const raw = await AsyncStorage.getItem(txKey(userId));
      if (!raw) return [] as Transaction[];
      const parsed = JSON.parse(raw) as Transaction[];
      // Only keep rows that belong to this account
      return parsed.filter((t) => !t.user_id || t.user_id === userId);
    } catch {
      return [];
    }
  }, [userId]);

  const loadCustomCategories = useCallback(async () => {
    if (!userId || userId === "demo") return [] as string[];
    try {
      const raw = await AsyncStorage.getItem(customCategoriesKey(userId));
      if (!raw) return [] as string[];
      const parsed = JSON.parse(raw) as string[];
      return parsed.map(normalizeCategoryName).filter(Boolean);
    } catch {
      return [];
    }
  }, [userId]);

  const loadLocalBudgets = useCallback(
    async (customs: string[]) => {
      if (!userId || userId === "demo") {
        return seedBudgetRows(currency, buildCategoryList(customs));
      }
      try {
        const raw = await AsyncStorage.getItem(
          budgetKey(userId, year, month),
        );
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
    [userId, year, month, currency],
  );

  const ensureCategoriesFromTxs = useCallback(
    (rows: Transaction[]) => {
      const newCats = rows
        .filter((r) => r.type === "expense")
        .map((r) => normalizeCategoryName(String(r.category)))
        .filter(Boolean);
      if (!newCats.length) return;
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
    },
    [currency, customCategories],
  );

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
      ensureCategoriesFromTxs(rows);
      setRefreshTick((n) => n + 1);
    },
    [persistTx, ensureCategoriesFromTxs],
  );

  const replaceLocalWithServer = useCallback(
    (localId: string, serverTx: Transaction) => {
      idMapRef.current.set(localId, serverTx.id);
      setTransactions((prev) => {
        const next = prev
          .filter((t) => t.id !== localId)
          .map((t) => (t.id === serverTx.id ? { ...serverTx, syncStatus: "synced" as const } : t));
        if (!next.some((t) => t.id === serverTx.id)) {
          next.unshift({ ...serverTx, syncStatus: "synced" });
        }
        const sorted = next.sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
        void persistTx(sorted);
        return sorted;
      });
      setRefreshTick((n) => n + 1);
    },
    [persistTx],
  );

  const flushSyncQueue = useCallback(async () => {
    if (!token || flushingRef.current) return;
    flushingRef.current = true;
    try {
      if (!userId || userId === "demo") return;
      let queue = await loadSyncQueue(userId);
      if (!queue.length) {
        setPendingSyncCount(0);
        return;
      }

      const remaining: SyncQueueItem[] = [];
      for (const item of queue) {
        try {
          if (item.op === "create") {
            const { transaction } = await createTransactionApi(token, {
              ...item.payload,
              client_id: item.localId,
            });
            replaceLocalWithServer(item.localId, transaction);
          } else if (item.op === "update") {
            const serverId =
              item.serverId ||
              idMapRef.current.get(item.localId) ||
              (!isLocalId(item.localId) ? item.localId : undefined);
            if (!serverId || isLocalId(serverId)) {
              remaining.push(item);
              continue;
            }
            const { transaction } = await updateTransactionApi(
              token,
              serverId,
              item.payload,
            );
            replaceLocalWithServer(serverId, transaction);
          } else if (item.op === "delete") {
            const serverId =
              item.serverId ||
              idMapRef.current.get(item.localId) ||
              (!isLocalId(item.localId) ? item.localId : undefined);
            if (!serverId || isLocalId(serverId)) {
              // create was cancelled or never synced — already removed locally
              continue;
            }
            await deleteTransactionApi(token, serverId);
          }
        } catch {
          remaining.push(item);
        }
      }

      await saveSyncQueue(userId, remaining);
      setPendingSyncCount(remaining.length);
    } finally {
      flushingRef.current = false;
    }
  }, [token, userId, replaceLocalWithServer]);

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
      nextTx = remote.map((t) => ({ ...t, syncStatus: "synced" as const }));
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
      (t) =>
        (!t.user_id || t.user_id === userId) &&
        (t.id.startsWith("local-") || t.syncStatus === "pending") &&
        !remoteIds.has(t.id),
    );
    const mergedMap = new Map<string, Transaction>();
    for (const t of nextTx) mergedMap.set(t.id, t);
    for (const t of localOnly) {
      if (!mergedMap.has(t.id)) {
        mergedMap.set(t.id, { ...t, syncStatus: t.syncStatus ?? "pending" });
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );

    setTransactions(merged);
    setBudgetBase(nextBudgets);
    await persistTx(merged);
    await persistBudgets(nextBudgets, year, month);
    await refreshPendingCount();
    setRefreshTick((n) => n + 1);
    setLoadingTx(false);
    setLoadingBudgets(false);

    if (isOnline) {
      await flushSyncQueue();
    }
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
    refreshPendingCount,
    flushSyncQueue,
    isOnline,
    userId,
  ]);

  const checkNetwork = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      return online;
    } catch {
      setIsOnline(true);
      return true;
    }
  }, []);

  useEffect(() => {
    void checkNetwork();
    const sub = Network.addNetworkStateListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) {
        void flushSyncQueue().then(() => refresh());
      }
    });
    return () => sub.remove();
  }, [checkNetwork, flushSyncQueue, refresh]);

  useEffect(() => {
    const onAppState = (status: AppStateStatus) => {
      if (status === "active") {
        void checkNetwork().then((online) => {
          if (online) void flushSyncQueue().then(() => refresh());
        });
      }
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [checkNetwork, flushSyncQueue, refresh]);

  // Drop shared legacy cache once so it cannot leak across accounts
  useEffect(() => {
    void purgeLegacySharedFinanceKeys();
  }, []);

  // Reset in-memory finance state when the logged-in user changes
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevUserIdRef.current && prevUserIdRef.current !== userId) {
      idMapRef.current = new Map();
      setTransactions([]);
      setCustomCategories([]);
      setBudgetBase(
        seedBudgetRows(currency, DEFAULT_EXPENSE as unknown as string[]),
      );
      setPendingSyncCount(0);
      setRefreshTick((n) => n + 1);
    }
    prevUserIdRef.current = userId;
  }, [userId, currency]);

  useEffect(() => {
    refresh().catch(() => {
      setLoadingTx(false);
      setLoadingBudgets(false);
    });
  }, [refresh, userId]);

  const createManualTransaction = useCallback(
    async (input: ManualTransactionInput) => {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const createdAt = input.created_at || new Date().toISOString();
      const payload: TransactionWriteInput = {
        amount: input.amount,
        currency,
        category: input.type === "income" ? "Income" : input.category,
        merchant: input.merchant || (input.type === "income" ? "Income" : input.category),
        type: input.type,
        payment_method: input.payment_method || "",
        notes: input.notes || "",
        created_at: createdAt,
        client_id: localId,
      };

      const localTx: Transaction = {
        id: localId,
        user_id: userId,
        amount: payload.amount,
        currency: payload.currency || currency,
        category: payload.category,
        merchant: payload.merchant,
        type: payload.type,
        payment_method: payload.payment_method || "",
        notes: payload.notes || "",
        created_at: createdAt,
        syncStatus: "pending",
      };

      addTransactions([localTx]);

      const online = await checkNetwork();
      if (online && token) {
        try {
          const { transaction } = await createTransactionApi(token, payload);
          replaceLocalWithServer(localId, transaction);
          return { ...transaction, syncStatus: "synced" as const };
        } catch {
          await enqueueSync(userId, { op: "create", localId, payload });
          await refreshPendingCount();
          return localTx;
        }
      }

      await enqueueSync(userId, { op: "create", localId, payload });
      await refreshPendingCount();
      return localTx;
    },
    [
      currency,
      userId,
      token,
      addTransactions,
      checkNetwork,
      replaceLocalWithServer,
      refreshPendingCount,
    ],
  );

  const updateTransaction = useCallback(
    async (id: string, patch: Partial<ManualTransactionInput>) => {
      const payload: Partial<TransactionWriteInput> = {};
      if (patch.amount != null) payload.amount = patch.amount;
      if (patch.category != null) payload.category = patch.category;
      if (patch.merchant != null) payload.merchant = patch.merchant;
      if (patch.type != null) {
        payload.type = patch.type;
        if (patch.type === "income") payload.category = "Income";
      }
      if (patch.payment_method != null) payload.payment_method = patch.payment_method;
      if (patch.notes != null) payload.notes = patch.notes;
      if (patch.created_at != null) payload.created_at = patch.created_at;

      setTransactions((prev) => {
        const next = prev.map((t) =>
          t.id === id
            ? {
                ...t,
                ...payload,
                category:
                  payload.type === "income"
                    ? "Income"
                    : (payload.category ?? t.category),
                syncStatus: "pending" as const,
              }
            : t,
        );
        void persistTx(next);
        return next;
      });
      setRefreshTick((n) => n + 1);

      const online = await checkNetwork();
      const serverId = idMapRef.current.get(id) || id;

      if (online && token && !isLocalId(serverId)) {
        try {
          const { transaction } = await updateTransactionApi(token, serverId, payload);
          replaceLocalWithServer(serverId, transaction);
          return;
        } catch {
          // queue below
        }
      }

      await enqueueSync(userId, {
        op: "update",
        localId: id,
        serverId: isLocalId(serverId) ? undefined : serverId,
        payload,
      });
      await refreshPendingCount();
    },
    [
      token,
      userId,
      persistTx,
      checkNetwork,
      replaceLocalWithServer,
      refreshPendingCount,
    ],
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      setTransactions((prev) => {
        const next = prev.filter((t) => t.id !== id);
        void persistTx(next);
        return next;
      });
      setRefreshTick((n) => n + 1);

      const online = await checkNetwork();
      const serverId = idMapRef.current.get(id) || id;

      if (isLocalId(id) && !idMapRef.current.has(id)) {
        await enqueueSync(userId, { op: "delete", localId: id });
        await refreshPendingCount();
        return;
      }

      if (online && token && !isLocalId(serverId)) {
        try {
          await deleteTransactionApi(token, serverId);
          return;
        } catch {
          // queue below
        }
      }

      await enqueueSync(userId, {
        op: "delete",
        localId: id,
        serverId: isLocalId(serverId) ? undefined : serverId,
      });
      await refreshPendingCount();
    },
    [token, userId, persistTx, checkNetwork, refreshPendingCount],
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
        const raw =
          userId && userId !== "demo"
            ? await AsyncStorage.getItem(budgetKey(userId, y, m))
            : null;
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
    [
      year,
      month,
      budgetRows,
      customCategories,
      currency,
      transactions,
      userId,
    ],
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
      isOnline,
      pendingSyncCount,
      refresh,
      flushSyncQueue,
      addTransactions,
      mergeOptimistic: addTransactions,
      createManualTransaction,
      updateTransaction,
      deleteTransaction,
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
      isOnline,
      pendingSyncCount,
      refresh,
      flushSyncQueue,
      addTransactions,
      createManualTransaction,
      updateTransaction,
      deleteTransaction,
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
