import type { BudgetActualRow, CurrencyCode, Profile, Transaction } from "../types";
import { showDevUi } from "./env";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001").replace(
  /\/$/,
  "",
);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function networkErrorMessage() {
  if (showDevUi) {
    return `Could not reach FINPA server at ${API_URL}. Use your PC LAN IP (not localhost) and keep the backend running.`;
  }
  return "Could not reach FINPA servers. Check your internet connection and try again.";
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        // localtunnel browser interstitial bypass for device testing
        "Bypass-Tunnel-Reminder": "true",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(
        res.status,
        body.code || "INTERNAL",
        body.message || `Request failed (${res.status})`,
      );
    }
    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new ApiError(504, "UPSTREAM_TIMEOUT", "Request timed out. Try again.");
    }
    throw new ApiError(0, "NETWORK", networkErrorMessage());
  } finally {
    clearTimeout(timer);
  }
}

export function getApiUrl() {
  return API_URL;
}

export type AdminPin = {
  code: string;
  period: "monthly" | "annual";
  duration_days: number;
  redeemed_by: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  notes: string;
  created_at: string;
};

export async function fetchMe(token: string) {
  return request<{
    profile: Profile;
    subscriptionActive: boolean;
    isSuperAdmin?: boolean;
    currencies: CurrencyCode[];
  }>("/api/me", { token });
}

export async function fetchAdminPins(
  token: string,
  opts: {
    status?: "unused" | "redeemed" | "all";
    period?: "monthly" | "annual" | "all";
    q?: string;
    limit?: number;
  } = {},
) {
  const status = opts.status ?? "all";
  const period = opts.period ?? "all";
  const limit = opts.limit ?? 100;
  const q = (opts.q ?? "").trim();
  const params = new URLSearchParams({
    status,
    period,
    limit: String(limit),
  });
  if (q) params.set("q", q);
  return request<{ pins: AdminPin[] }>(`/api/admin/pins?${params}`, { token });
}

export async function generateAdminPins(
  token: string,
  period: "monthly" | "annual",
  count: number,
  notes = "",
) {
  return request<{ pins: AdminPin[] }>("/api/admin/pins/generate", {
    method: "POST",
    token,
    body: JSON.stringify({ period, count, notes }),
  });
}

export async function updateAdminPin(
  token: string,
  code: string,
  patch: {
    period?: "monthly" | "annual";
    duration_days?: number;
    expires_at?: string | null;
    notes?: string;
  },
) {
  return request<{ pin: AdminPin }>(
    `/api/admin/pins/${encodeURIComponent(code)}`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify(patch),
    },
  );
}

export async function revokeAdminPin(token: string, code: string) {
  return request<{ ok: boolean }>(
    `/api/admin/pins/${encodeURIComponent(code)}`,
    { method: "DELETE", token },
  );
}

export async function updateCurrency(token: string, preferred_currency: CurrencyCode) {
  return request<{ profile: Profile; subscriptionActive: boolean }>("/api/me", {
    method: "PATCH",
    token,
    body: JSON.stringify({ preferred_currency }),
  });
}

export async function redeemPin(token: string, code: string) {
  return request<{ profile: Profile; subscriptionActive: boolean; summary: string }>(
    "/api/pins/redeem",
    { method: "POST", token, body: JSON.stringify({ code }) },
  );
}

export async function chatExpense(
  token: string,
  message: string,
  categories: string[] = [],
) {
  return request<{
    action: string;
    summary: string;
    transactions: Transaction[];
  }>("/api/chat-expense", {
    method: "POST",
    token,
    body: JSON.stringify({
      message,
      categories: categories.filter(Boolean).slice(0, 40),
    }),
  });
}

export async function fetchTransactions(token: string) {
  return request<{ transactions: Transaction[] }>("/api/transactions", { token });
}

export type TransactionWriteInput = {
  amount: number;
  currency?: string;
  category: string;
  merchant: string;
  type: "expense" | "income";
  payment_method?: string;
  notes?: string;
  created_at?: string;
  client_id?: string;
};

export async function createTransactionApi(
  token: string,
  body: TransactionWriteInput,
) {
  return request<{ transaction: Transaction; client_id: string | null }>(
    "/api/transactions",
    { method: "POST", token, body: JSON.stringify(body) },
  );
}

export async function updateTransactionApi(
  token: string,
  id: string,
  body: Partial<TransactionWriteInput>,
) {
  return request<{ transaction: Transaction }>(
    `/api/transactions/${encodeURIComponent(id)}`,
    { method: "PATCH", token, body: JSON.stringify(body) },
  );
}

export async function deleteTransactionApi(token: string, id: string) {
  return request<{ ok: boolean }>(
    `/api/transactions/${encodeURIComponent(id)}`,
    { method: "DELETE", token },
  );
}

export async function fetchBudgets(token: string, year: number, month: number) {
  return request<{
    rows: BudgetActualRow[];
    incomeTotal: number;
  }>(`/api/budgets/${year}/${month}`, { token });
}

export async function saveBudgets(
  token: string,
  year: number,
  month: number,
  items: { category: string; budget_amount: number }[],
) {
  return request<{ rows: BudgetActualRow[]; incomeTotal: number }>(
    `/api/budgets/${year}/${month}`,
    {
      method: "PUT",
      token,
      body: JSON.stringify({ items }),
    },
  );
}
