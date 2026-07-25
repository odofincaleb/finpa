export const CATEGORIES = [
  "Groceries",
  "Dining Out",
  "Transportation",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Income",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CURRENCIES = ["NGN", "USD", "EUR", "GBP", "GHS", "KES", "ZAR"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  NGN: "₦",
  USD: "$",
  EUR: "€",
  GBP: "£",
  GHS: "₵",
  KES: "KSh",
  ZAR: "R",
};

export type TransactionType = "expense" | "income";
export type SubscriptionPeriod = "monthly" | "annual";

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  category: Category | string;
  merchant: string;
  type: TransactionType;
  payment_method: string;
  notes: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  preferred_currency: CurrencyCode;
  subscription_period: SubscriptionPeriod | null;
  subscription_expires_at: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface BudgetActualRow {
  category: string;
  budget_amount: number;
  actual_amount: number;
  remaining: number;
  currency: string;
}

export interface ChatFeedItem {
  id: string;
  role: "user" | "assistant";
  text: string;
}
