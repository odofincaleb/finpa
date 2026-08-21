import { getSupabase, hasSupabase } from "../lib/supabase";
import { AppError } from "../lib/errors";
import { findMatchingTransaction } from "../lib/matchTransaction";
import {
  allowDemoPins,
  generateActivationCode,
  isDemoPinCode,
} from "../lib/securePin";
import {
  memoryCreatePinSale,
  memoryCreatePins,
  memoryDeletePin,
  memoryGetBudgets,
  memoryGetPin,
  memoryGetPinSaleByReference,
  memoryGetProfile,
  memoryDeleteTransaction,
  memoryInsertTransactions,
  memoryListPins,
  memoryListTransactions,
  memoryRedeemPin,
  memoryUpdatePin,
  memoryUpdateProfile,
  memoryUpdateTransaction,
  memoryUpdateTransactionById,
  memoryUpsertBudgets,
  type MemoryPin,
  type MemoryPinSale,
} from "./memoryStore";
import type {
  BudgetActualRow,
  Category,
  CurrencyCode,
  MonthlyBudget,
  Profile,
  SubscriptionPeriod,
  TransactionExtract,
  TransactionRecord,
} from "../types/transaction";
import { CATEGORIES } from "../types/transaction";

export async function getProfile(userId: string, email: string): Promise<Profile> {
  if (!hasSupabase()) return memoryGetProfile(userId, email);

  const supabase = getSupabase();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new AppError(500, "INTERNAL", error.message);
  if (data) return data as Profile;

  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({ id: userId, email, preferred_currency: "NGN" })
    .select("*")
    .single();
  if (createError || !created) {
    throw new AppError(500, "INTERNAL", createError?.message ?? "Failed to create profile");
  }
  return created as Profile;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, "preferred_currency" | "email">>,
): Promise<Profile> {
  if (!hasSupabase()) return memoryUpdateProfile(userId, patch);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error || !data) throw new AppError(500, "INTERNAL", error?.message ?? "Update failed");
  return data as Profile;
}

export async function listTransactions(userId: string, limit = 50): Promise<TransactionRecord[]> {
  if (!hasSupabase()) return memoryListTransactions(userId, limit);

  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return (data ?? []) as TransactionRecord[];
}

export async function insertTransactions(
  userId: string,
  items: TransactionExtract[],
): Promise<TransactionRecord[]> {
  if (!hasSupabase()) return memoryInsertTransactions(userId, items);

  const rows = items.map((item) => ({ ...item, user_id: userId }));
  const { data, error } = await getSupabase().from("transactions").insert(rows).select("*");
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return (data ?? []) as TransactionRecord[];
}

export async function updateMatchedTransaction(
  userId: string,
  match: string,
  fields: Partial<TransactionExtract>,
  message?: string,
): Promise<TransactionRecord | null> {
  if (!hasSupabase()) {
    return memoryUpdateTransaction(userId, match, fields, message);
  }

  const recent = await listTransactions(userId, 40);
  const target = findMatchingTransaction(recent, match, message);
  if (!target) return null;

  const { data, error } = await getSupabase()
    .from("transactions")
    .update(fields)
    .eq("id", target.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return data as TransactionRecord;
}

export type TransactionWriteFields = TransactionExtract & {
  created_at?: string;
};

export async function createTransaction(
  userId: string,
  fields: TransactionWriteFields,
): Promise<TransactionRecord> {
  const item: TransactionExtract = {
    amount: fields.amount,
    currency: fields.currency,
    category: fields.category,
    merchant: fields.merchant,
    type: fields.type,
    payment_method: fields.payment_method ?? "",
    notes: fields.notes ?? "",
  };

  if (!hasSupabase()) {
    const [created] = memoryInsertTransactions(userId, [item]);
    if (fields.created_at && created) {
      return (
        memoryUpdateTransactionById(userId, created.id, {
          created_at: fields.created_at,
        }) ?? created
      );
    }
    return created;
  }

  const row = {
    ...item,
    user_id: userId,
    ...(fields.created_at ? { created_at: fields.created_at } : {}),
  };
  const { data, error } = await getSupabase()
    .from("transactions")
    .insert(row)
    .select("*")
    .single();
  if (error || !data) {
    throw new AppError(500, "INTERNAL", error?.message ?? "Create failed");
  }
  return data as TransactionRecord;
}

export async function updateTransactionById(
  userId: string,
  id: string,
  fields: Partial<TransactionWriteFields>,
): Promise<TransactionRecord> {
  if (!hasSupabase()) {
    const updated = memoryUpdateTransactionById(userId, id, fields);
    if (!updated) throw new AppError(404, "NOT_FOUND", "Transaction not found");
    return updated;
  }

  const { data, error } = await getSupabase()
    .from("transactions")
    .update(fields)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error || !data) {
    throw new AppError(
      error?.code === "PGRST116" ? 404 : 500,
      error?.code === "PGRST116" ? "NOT_FOUND" : "INTERNAL",
      error?.message ?? "Update failed",
    );
  }
  return data as TransactionRecord;
}

export async function deleteTransaction(
  userId: string,
  id: string,
): Promise<void> {
  if (!hasSupabase()) {
    const ok = memoryDeleteTransaction(userId, id);
    if (!ok) throw new AppError(404, "NOT_FOUND", "Transaction not found");
    return;
  }

  const { data, error } = await getSupabase()
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new AppError(500, "INTERNAL", error.message);
  if (!data) throw new AppError(404, "NOT_FOUND", "Transaction not found");
}

export async function getBudgetsWithActuals(
  userId: string,
  year: number,
  month: number,
  currency: string,
): Promise<{ budgets: MonthlyBudget[]; rows: BudgetActualRow[]; incomeTotal: number }> {
  const budgetRows = !hasSupabase()
    ? memoryGetBudgets(userId, year, month)
    : await (async () => {
        const { data, error } = await getSupabase()
          .from("monthly_budgets")
          .select("*")
          .eq("user_id", userId)
          .eq("year", year)
          .eq("month", month);
        if (error) throw new AppError(500, "INTERNAL", error.message);
        return (data ?? []) as MonthlyBudget[];
      })();

  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();

  const txns = !hasSupabase()
    ? memoryListTransactions(userId, 500).filter(
        (t) => t.created_at >= start && t.created_at < end,
      )
    : await (async () => {
        const { data, error } = await getSupabase()
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .gte("created_at", start)
          .lt("created_at", end);
        if (error) throw new AppError(500, "INTERNAL", error.message);
        return (data ?? []) as TransactionRecord[];
      })();

  const actualByCategory = new Map<string, number>();
  let incomeTotal = 0;
  for (const t of txns) {
    if (t.type === "income") {
      incomeTotal += Number(t.amount);
      continue;
    }
    actualByCategory.set(
      t.category,
      (actualByCategory.get(t.category) ?? 0) + Number(t.amount),
    );
  }

  const budgetMap = new Map(budgetRows.map((b) => [b.category, b]));
  const categorySet = new Set<string>([
    ...CATEGORIES.filter((c) => c !== "Income"),
    ...budgetRows.map((b) => b.category),
    ...Array.from(actualByCategory.keys()),
  ]);
  categorySet.delete("Income");

  const rows: BudgetActualRow[] = Array.from(categorySet).map((category) => {
    const budget_amount = Number(budgetMap.get(category)?.budget_amount ?? 0);
    const actual_amount = actualByCategory.get(category) ?? 0;
    return {
      category: category as Category,
      budget_amount,
      actual_amount,
      remaining: budget_amount - actual_amount,
      currency: budgetMap.get(category)?.currency ?? currency,
    };
  });

  return { budgets: budgetRows, rows, incomeTotal };
}

export async function upsertBudgets(
  userId: string,
  year: number,
  month: number,
  currency: string,
  items: { category: string; budget_amount: number }[],
): Promise<MonthlyBudget[]> {
  if (!hasSupabase()) return memoryUpsertBudgets(userId, year, month, currency, items);

  const rows = items.map((item) => ({
    user_id: userId,
    year,
    month,
    category: item.category,
    budget_amount: item.budget_amount,
    currency,
  }));

  const { data, error } = await getSupabase()
    .from("monthly_budgets")
    .upsert(rows, { onConflict: "user_id,year,month,category" })
    .select("*");
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return (data ?? []) as MonthlyBudget[];
}


export type AdminPin = {
  code: string;
  period: SubscriptionPeriod;
  duration_days: number;
  redeemed_by: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  notes: string;
  created_at: string;
  source: "admin" | "paystack";
  buyer_email: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  amount_paid: number | null;
  currency: "NGN" | "USD" | null;
  paystack_reference: string | null;
  paystack_status: string | null;
  sold_at: string | null;
  email_status: "pending" | "sent" | "failed" | null;
};

export type PinSale = {
  id: string;
  pin_code: string;
  plan_id: string;
  period: SubscriptionPeriod;
  duration_days: number;
  buyer_email: string;
  buyer_name: string;
  buyer_phone: string;
  currency: "NGN" | "USD";
  amount_paid: number;
  paystack_reference: string;
  paystack_status: string;
  source: "paystack";
  sold_at: string;
  metadata: Record<string, unknown>;
  email_status: "pending" | "sent" | "failed";
};

function firstSale(p: Record<string, unknown>): Record<string, unknown> | null {
  const nested = p.pin_sales;
  if (Array.isArray(nested)) return (nested[0] as Record<string, unknown> | undefined) ?? null;
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return null;
}

function mapPinRow(p: Record<string, unknown>): AdminPin {
  const sale = firstSale(p);
  return {
    code: String(p.code),
    period: p.period as SubscriptionPeriod,
    duration_days: Number(p.duration_days),
    redeemed_by: (p.redeemed_by as string | null) ?? null,
    redeemed_at: (p.redeemed_at as string | null) ?? null,
    expires_at: (p.expires_at as string | null) ?? null,
    notes: String(p.notes ?? ""),
    created_at: String(p.created_at ?? new Date().toISOString()),
    source: ((sale?.source as "paystack" | undefined) ?? p.source ?? "admin") as "admin" | "paystack",
    buyer_email: ((sale?.buyer_email ?? p.buyer_email) as string | null) ?? null,
    buyer_name: ((sale?.buyer_name ?? p.buyer_name) as string | null) ?? null,
    buyer_phone: ((sale?.buyer_phone ?? p.buyer_phone) as string | null) ?? null,
    amount_paid:
      sale?.amount_paid != null || p.amount_paid != null
        ? Number((sale?.amount_paid ?? p.amount_paid) as number)
        : null,
    currency: ((sale?.currency ?? p.currency) as "NGN" | "USD" | null) ?? null,
    paystack_reference: ((sale?.paystack_reference ?? p.paystack_reference) as string | null) ?? null,
    paystack_status: ((sale?.paystack_status ?? p.paystack_status) as string | null) ?? null,
    sold_at: ((sale?.sold_at ?? p.sold_at) as string | null) ?? null,
    email_status: ((sale?.email_status ?? p.email_status) as "pending" | "sent" | "failed" | null) ?? null,
  };
}

function mapMemoryPin(p: MemoryPin): AdminPin {
  return {
    ...p,
    source: p.source ?? "admin",
    buyer_email: p.buyer_email ?? null,
    buyer_name: p.buyer_name ?? null,
    buyer_phone: p.buyer_phone ?? null,
    amount_paid: p.amount_paid ?? null,
    currency: p.currency ?? null,
    paystack_reference: p.paystack_reference ?? null,
    paystack_status: p.paystack_status ?? null,
    sold_at: p.sold_at ?? null,
    email_status: p.email_status ?? null,
  };
}

function mapPinSaleRow(row: Record<string, unknown>): PinSale {
  return {
    id: String(row.id),
    pin_code: String(row.pin_code),
    plan_id: String(row.plan_id),
    period: row.period as SubscriptionPeriod,
    duration_days: Number(row.duration_days),
    buyer_email: String(row.buyer_email),
    buyer_name: String(row.buyer_name ?? ""),
    buyer_phone: String(row.buyer_phone ?? ""),
    currency: row.currency as "NGN" | "USD",
    amount_paid: Number(row.amount_paid),
    paystack_reference: String(row.paystack_reference),
    paystack_status: String(row.paystack_status),
    source: "paystack",
    sold_at: String(row.sold_at ?? new Date().toISOString()),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    email_status: (row.email_status as "pending" | "sent" | "failed" | null) ?? "pending",
  };
}

function mapMemoryPinSale(row: MemoryPinSale): PinSale {
  return { ...row };
}

export async function generatePins(
  period: SubscriptionPeriod,
  count: number,
  notes = "",
): Promise<AdminPin[]> {
  if (!hasSupabase()) return memoryCreatePins(period, count, notes).map(mapMemoryPin);

  const duration_days = period === "annual" ? 365 : 30;
  const label = notes.trim();
  const rows = Array.from({ length: count }, () => ({
    code: generateActivationCode(),
    period,
    duration_days,
    notes: label,
  }));

  const { data, error } = await getSupabase()
    .from("activation_pins")
    .insert(rows)
    .select("*");
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return (data ?? []).map((p) => mapPinRow(p as Record<string, unknown>));
}

export async function listPins(
  status: "unused" | "redeemed" | "all" = "all",
  limit = 100,
  search = "",
  period: "monthly" | "annual" | "all" = "all",
): Promise<AdminPin[]> {
  if (!hasSupabase()) {
    return memoryListPins(status, limit, search, period).map(mapMemoryPin);
  }

  let q = getSupabase()
    .from("activation_pins")
    .select("*,pin_sales(*)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (status === "unused") q = q.is("redeemed_by", null);
  if (status === "redeemed") q = q.not("redeemed_by", "is", null);
  if (period === "monthly" || period === "annual") {
    q = q.eq("period", period);
  }

  const needle = search.trim();
  if (needle) {
    const safe = needle.replace(/[%_,]/g, "");
    if (safe) {
      q = q.or(`code.ilike.%${safe}%,notes.ilike.%${safe}%`);
    }
  }

  const { data, error } = await q;
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return (data ?? []).map((p) => mapPinRow(p as Record<string, unknown>));
}

export async function getPin(code: string): Promise<AdminPin | null> {
  if (!hasSupabase()) {
    const p = memoryGetPin(code);
    return p ? mapMemoryPin(p) : null;
  }
  const { data, error } = await getSupabase()
    .from("activation_pins")
    .select("*,pin_sales(*)")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return data ? mapPinRow(data as Record<string, unknown>) : null;
}

export async function getPaystackPinSaleByReference(reference: string): Promise<PinSale | null> {
  const normalized = reference.trim();
  if (!normalized) return null;
  if (!hasSupabase()) {
    const sale = memoryGetPinSaleByReference(normalized);
    return sale ? mapMemoryPinSale(sale) : null;
  }
  const { data, error } = await getSupabase()
    .from("pin_sales")
    .select("*")
    .eq("paystack_reference", normalized)
    .maybeSingle();
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return data ? mapPinSaleRow(data as Record<string, unknown>) : null;
}

export async function createPaystackPinSale(input: Omit<PinSale, "id" | "pin_code">): Promise<PinSale> {
  const existing = await getPaystackPinSaleByReference(input.paystack_reference);
  if (existing) return existing;

  if (!hasSupabase()) {
    return mapMemoryPinSale(memoryCreatePinSale(input));
  }

  const code = generateActivationCode();
  const supabase = getSupabase();
  const pinInsert = await supabase
    .from("activation_pins")
    .insert({
      code,
      period: input.period,
      duration_days: input.duration_days,
      notes: `Paystack sale ${input.paystack_reference} ${input.buyer_email}`.trim(),
    })
    .select("code")
    .single();
  if (pinInsert.error) throw new AppError(500, "INTERNAL", pinInsert.error.message);

  const { data, error } = await supabase
    .from("pin_sales")
    .insert({ ...input, pin_code: code })
    .select("*")
    .single();

  if (error) {
    const duplicate = await getPaystackPinSaleByReference(input.paystack_reference);
    if (duplicate) return duplicate;
    throw new AppError(500, "INTERNAL", error.message);
  }
  return mapPinSaleRow(data as Record<string, unknown>);
}

export async function updatePaystackPinSaleEmailStatus(
  reference: string,
  email_status: "pending" | "sent" | "failed",
): Promise<void> {
  if (!hasSupabase()) return;
  const { error } = await getSupabase()
    .from("pin_sales")
    .update({ email_status })
    .eq("paystack_reference", reference.trim());
  if (error) throw new AppError(500, "INTERNAL", error.message);
}

export async function updatePin(
  code: string,
  patch: {
    period?: SubscriptionPeriod;
    duration_days?: number;
    expires_at?: string | null;
    notes?: string;
  },
): Promise<AdminPin> {
  if (!hasSupabase()) {
    try {
      return mapMemoryPin(memoryUpdatePin(code, patch));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NOT_FOUND") throw new AppError(404, "NOT_FOUND", "PIN not found");
      if (msg === "REDEEMED") {
        throw new AppError(400, "PIN_REDEEMED", "Cannot edit a redeemed PIN");
      }
      throw e;
    }
  }

  const existing = await getPin(code);
  if (!existing) throw new AppError(404, "NOT_FOUND", "PIN not found");
  if (existing.redeemed_by) {
    throw new AppError(400, "PIN_REDEEMED", "Cannot edit a redeemed PIN");
  }

  const updates: Record<string, unknown> = {};
  if (patch.period) {
    updates.period = patch.period;
    if (patch.duration_days == null) {
      updates.duration_days = patch.period === "annual" ? 365 : 30;
    }
  }
  if (patch.duration_days != null) updates.duration_days = patch.duration_days;
  if (patch.expires_at !== undefined) updates.expires_at = patch.expires_at;
  if (patch.notes !== undefined) updates.notes = patch.notes;

  const { data, error } = await getSupabase()
    .from("activation_pins")
    .update(updates)
    .eq("code", code.trim().toUpperCase())
    .is("redeemed_by", null)
    .select("*")
    .maybeSingle();

  if (error) throw new AppError(500, "INTERNAL", error.message);
  if (!data) throw new AppError(404, "NOT_FOUND", "PIN not found or already redeemed");
  return mapPinRow(data as Record<string, unknown>);
}

export async function deletePin(code: string): Promise<void> {
  if (!hasSupabase()) {
    try {
      memoryDeletePin(code);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "NOT_FOUND") throw new AppError(404, "NOT_FOUND", "PIN not found");
      if (msg === "REDEEMED") {
        throw new AppError(400, "PIN_REDEEMED", "Cannot delete a redeemed PIN");
      }
      throw e;
    }
  }

  const existing = await getPin(code);
  if (!existing) throw new AppError(404, "NOT_FOUND", "PIN not found");
  if (existing.redeemed_by) {
    throw new AppError(400, "PIN_REDEEMED", "Cannot delete a redeemed PIN");
  }

  const { error } = await getSupabase()
    .from("activation_pins")
    .delete()
    .eq("code", code.trim().toUpperCase())
    .is("redeemed_by", null);

  if (error) throw new AppError(500, "INTERNAL", error.message);
}

export async function redeemPin(userId: string, code: string): Promise<Profile> {
  const normalized = code.trim().toUpperCase();
  if (isDemoPinCode(normalized) && !allowDemoPins()) {
    throw new AppError(400, "PIN_INVALID", "Invalid or already used PIN");
  }

  if (!hasSupabase()) {
    try {
      return memoryRedeemPin(userId, code);
    } catch {
      throw new AppError(400, "PIN_INVALID", "Invalid or already used PIN");
    }
  }

  const { data, error } = await getSupabase().rpc("redeem_activation_pin", {
    p_code: normalized,
    p_user_id: userId,
    p_allow_demo: allowDemoPins(),
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("PIN_INVALID")) {
      throw new AppError(400, "PIN_INVALID", "Invalid or already used PIN");
    }
    throw new AppError(500, "INTERNAL", msg);
  }
  if (!data) {
    throw new AppError(400, "PIN_INVALID", "Invalid or already used PIN");
  }
  return data as Profile;
}

export function isSubscriptionActive(profile: Profile): boolean {
  if (!profile.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at).getTime() > Date.now();
}

export type { CurrencyCode };
