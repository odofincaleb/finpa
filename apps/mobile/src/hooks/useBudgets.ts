import { useFinance } from "../context/FinanceContext";

export function useBudgets(_year?: number, _month?: number, _refreshKey = 0) {
  const {
    budgetRows,
    incomeTotal,
    loadingBudgets,
    refreshBudgets,
    upsertBudget,
    addCategory,
    expenseCategories,
    totalBudget,
    totalActual,
    remaining,
  } = useFinance();

  const upsert = async (items: { category: string; budget_amount: number }[]) => {
    for (const item of items) {
      await upsertBudget(item.category, item.budget_amount);
    }
  };

  return {
    rows: budgetRows,
    incomeTotal,
    loading: loadingBudgets,
    refresh: refreshBudgets,
    upsert,
    upsertBudget,
    addCategory,
    expenseCategories,
    totalBudget,
    totalActual,
    remaining,
  };
}
