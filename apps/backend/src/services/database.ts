import { getSupabase, hasSupabase } from "../lib/supabase";
import { AppError } from "../lib/errors";
import { findMatchingTransaction } from "../lib/matchTransaction";
import {
  memoryCreatePins,
  memoryDeletePin,
  memoryGetBudgets,
  memoryGetPin,
  memoryGetProfile,
  memoryInsertTransactions,
  memoryListPins,
  memoryListTransactions,
  memoryRedeemPin,
  memoryUpdatePin,
  memoryUpdateProfile,
  memoryUpdateTransaction,
  memoryUpsertBudgets,
  type MemoryPin,
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

function randomChunk() {
  return Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
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
};

function mapPinRow(p: Record<string, unknown>): AdminPin {
  return {
    code: String(p.code),
    period: p.period as SubscriptionPeriod,
    duration_days: Number(p.duration_days),
    redeemed_by: (p.redeemed_by as string | null) ?? null,
    redeemed_at: (p.redeemed_at as string | null) ?? null,
    expires_at: (p.expires_at as string | null) ?? null,
    notes: String(p.notes ?? ""),
    created_at: String(p.created_at ?? new Date().toISOString()),
  };
}

function mapMemoryPin(p: MemoryPin): AdminPin {
  return { ...p };
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
    code: `FINPA-${randomChunk()}-${randomChunk()}`,
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
    .select("*")
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
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new AppError(500, "INTERNAL", error.message);
  return data ? mapPinRow(data as Record<string, unknown>) : null;
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
  if (!hasSupabase()) {
    try {
      return memoryRedeemPin(userId, code);
    } catch {
      throw new AppError(400, "PIN_INVALID", "Invalid or already used PIN");
    }
  }

  const supabase = getSupabase();
  const normalized = code.trim().toUpperCase();
  // Shared demo codes stay reusable for testing / reviews
  const isDemoPin = normalized.startsWith("FINPA-DEMO-");

  const { data: pin, error } = await supabase
    .from("activation_pins")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();

  if (error) throw new AppError(500, "INTERNAL", error.message);
  if (!pin || (!isDemoPin && pin.redeemed_by)) {
    throw new AppError(400, "PIN_INVALID", "Invalid or already used PIN");
  }
  if (pin.expires_at && new Date(pin.expires_at).getTime() < Date.now()) {
    throw new AppError(400, "PIN_INVALID", "This PIN has expired");
  }

  const profile = await getProfile(userId, "");
  const base = Math.max(
    Date.now(),
    profile.subscription_expires_at
      ? new Date(profile.subscription_expires_at).getTime()
      : 0,
  );
  const expires = new Date(
    base + Number(pin.duration_days) * 24 * 60 * 60 * 1000,
  ).toISOString();

  if (!isDemoPin) {
    const { error: pinUpdateError } = await supabase
      .from("activation_pins")
      .update({ redeemed_by: userId, redeemed_at: new Date().toISOString() })
      .eq("id", pin.id)
      .is("redeemed_by", null);

    if (pinUpdateError) {
      throw new AppError(500, "INTERNAL", pinUpdateError.message);
    }
  }

  const { data: updated, error: profileError } = await supabase
    .from("profiles")
    .update({
      subscription_period: pin.period,
      subscription_expires_at: expires,
      activated_at: profile.activated_at ?? new Date().toISOString(),
    })
    .eq("id", userId)
    .select("*")
    .single();

  if (profileError || !updated) {
    throw new AppError(500, "INTERNAL", profileError?.message ?? "Failed to activate");
  }
  return updated as Profile;
}

export function isSubscriptionActive(profile: Profile): boolean {
  if (!profile.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at).getTime() > Date.now();
}

export type { CurrencyCode };
