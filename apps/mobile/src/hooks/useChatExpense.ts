import { useCallback, useState } from "react";
import { ApiError, chatExpense } from "../lib/api";
import { answerAskFinpa, type AskFinpaContext } from "../lib/askFinpa";
import { parseChatUpdate } from "../lib/parseChatUpdate";
import { parseExpenseLocally } from "../lib/localParse";
import { resolveCategory } from "../lib/resolveCategory";
import type { ChatFeedItem, Transaction } from "../types";
import { useAuth } from "../context/AuthContext";

function remapCategories(
  rows: Transaction[],
  message: string,
  categories: string[],
): Transaction[] {
  if (!categories.length) return rows;
  return rows.map((tx) => {
    if (tx.type === "income") return { ...tx, category: "Income" };
    const next = resolveCategory(message, tx.category, categories);
    return next === tx.category ? tx : { ...tx, category: next };
  });
}

function isLikelyUpdate(message: string): boolean {
  return /\b(change|update|move|recategoris|recategoriz|correct|switch|fix|put|make\s+it|should be|to category)\b/i.test(
    message,
  );
}

export function useChatExpense(
  onCreated?: (rows: Transaction[]) => void,
  expenseCategories: string[] = [],
  transactions: Transaction[] = [],
  askContext?: AskFinpaContext | null,
) {
  const { token, profile, isDevAuth } = useAuth();
  const [sending, setSending] = useState(false);
  const [feed, setFeed] = useState<ChatFeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pushAssistant = useCallback((text: string) => {
    const assistantItem: ChatFeedItem = {
      id: `${Date.now()}-a`,
      role: "assistant",
      text,
    };
    setFeed((f) => [...f, assistantItem].slice(-8));
  }, []);

  const applyLocalUpdate = useCallback(
    (text: string) => {
      const localUpdate = parseChatUpdate(
        text,
        transactions,
        expenseCategories,
      );
      if (!localUpdate) return false;
      pushAssistant(localUpdate.summary);
      onCreated?.([localUpdate.transaction]);
      return true;
    },
    [transactions, expenseCategories, onCreated, pushAssistant],
  );

  const tryAsk = useCallback(
    (text: string, askOnly: boolean) => {
      if (!askContext) return false;
      const answer = answerAskFinpa(text, askContext);
      if (!answer) {
        if (askOnly) {
          pushAssistant(
            "Ask me about affordability or budgets — e.g. “Can I afford ₦80,000 shoes?” or “How much left in School?”",
          );
          return true;
        }
        return false;
      }
      pushAssistant(answer);
      return true;
    },
    [askContext, pushAssistant],
  );

  const send = useCallback(
    async (message: string, options?: { askOnly?: boolean }) => {
      if (!token || !message.trim()) return;
      const text = message.trim();
      const askOnly = options?.askOnly === true;
      setError(null);
      setSending(true);
      const userItem: ChatFeedItem = { id: `${Date.now()}-u`, role: "user", text };
      setFeed((f) => [...f, userItem].slice(-8));

      if (askOnly) {
        tryAsk(text, true);
        setSending(false);
        return;
      }

      // Ask FINPA Q&A before treating as a new expense
      if (tryAsk(text, false)) {
        setSending(false);
        return;
      }

      // Local ledger is source of truth for Expo Go / local-* txs — handle moves first
      if (isLikelyUpdate(text) && applyLocalUpdate(text)) {
        setSending(false);
        return;
      }

      try {
        const result = await chatExpense(token, text, expenseCategories);
        let txs = result.transactions ?? [];

        // Server couldn't find the row (common for local-only entries)
        if (
          (!txs.length || result.action === "clarify") &&
          isLikelyUpdate(text) &&
          applyLocalUpdate(text)
        ) {
          setSending(false);
          return;
        }

        // AI sometimes creates a duplicate instead of updating — prefer local move
        if (
          result.action === "create" &&
          isLikelyUpdate(text) &&
          applyLocalUpdate(text)
        ) {
          setSending(false);
          return;
        }

        // Clarify from AI: try Ask as a helpful fallback
        if (
          (result.action === "clarify" || !txs.length) &&
          tryAsk(text, false)
        ) {
          setSending(false);
          return;
        }

        if (result.action !== "update") {
          txs = remapCategories(txs, text, expenseCategories);
        }

        pushAssistant(result.summary);
        if (txs.length) {
          onCreated?.(txs);
        }
      } catch (err) {
        if (isLikelyUpdate(text) && applyLocalUpdate(text)) {
          setSending(false);
          return;
        }
        if (tryAsk(text, false)) {
          setSending(false);
          return;
        }

        // Dev / unreachable tunnel: parse locally so Expo Go testing can continue
        if (isDevAuth) {
          const local = parseExpenseLocally(
            text,
            profile?.id || "dev-user",
            profile?.preferred_currency || "NGN",
            expenseCategories,
          );
          if (local) {
            pushAssistant(local.summary);
            onCreated?.(local.transactions);
            setSending(false);
            return;
          }
        }

        const status = err instanceof ApiError ? err.status : 0;
        const msg =
          err instanceof ApiError
            ? err.code === "RATE_LIMIT"
              ? "Free-tier limit hit. Wait a moment and try again."
              : err.code === "UPSTREAM_TIMEOUT"
                ? "AI timed out. Please try again."
                : status === 502 || status === 503
                  ? "API tunnel is down (502/503). Restart localtunnel or use a message like “Spent 4500 on fuel” (offline demo)."
                  : err.message
            : "Something went wrong.";
        setError(msg);
        pushAssistant(msg);
      } finally {
        setSending(false);
      }
    },
    [
      token,
      onCreated,
      isDevAuth,
      profile?.id,
      profile?.preferred_currency,
      expenseCategories,
      applyLocalUpdate,
      tryAsk,
      pushAssistant,
    ],
  );

  return { send, sending, feed, error, setError };
}
