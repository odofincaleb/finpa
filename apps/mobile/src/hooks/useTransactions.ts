import { useFinance } from "../context/FinanceContext";

export function useTransactions() {
  const {
    transactions,
    loadingTx,
    refresh,
    addTransactions,
    mergeOptimistic,
    refreshTick,
    createManualTransaction,
    updateTransaction,
    deleteTransaction,
    isOnline,
    pendingSyncCount,
    flushSyncQueue,
  } = useFinance();

  return {
    transactions,
    loading: loadingTx,
    refresh,
    mergeOptimistic,
    addTransactions,
    refreshTick,
    createManualTransaction,
    updateTransaction,
    deleteTransaction,
    isOnline,
    pendingSyncCount,
    flushSyncQueue,
  };
}
