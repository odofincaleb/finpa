import { useFinance } from "../context/FinanceContext";

export function useTransactions() {
  const {
    transactions,
    loadingTx,
    refresh,
    addTransactions,
    mergeOptimistic,
    refreshTick,
  } = useFinance();

  return {
    transactions,
    loading: loadingTx,
    refresh,
    mergeOptimistic,
    addTransactions,
    refreshTick,
  };
}
