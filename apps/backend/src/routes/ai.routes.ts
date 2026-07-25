import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth, requireSubscription } from "../middleware/auth";
import { extractTransactions } from "../services/openrouter";
import {
  insertTransactions,
  listTransactions,
  updateMatchedTransaction,
} from "../services/database";
import { AppError } from "../lib/errors";
import type { CurrencyCode } from "../types/transaction";

const router = Router();

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  categories: z.array(z.string().min(1).max(64)).max(40).optional(),
});

router.post(
  "/chat-expense",
  requireAuth,
  requireSubscription,
  async (req, res, next) => {
    try {
      const { userId, profile } = req as AuthedRequest;
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "VALIDATION_ERROR", "message is required");
      }

      const ai = await extractTransactions(
        parsed.data.message,
        profile.preferred_currency as CurrencyCode,
        parsed.data.categories ?? [],
      );

      if (ai.action === "clarify") {
        res.json({
          action: ai.action,
          summary: ai.summary,
          transactions: [],
        });
        return;
      }

      if (ai.action === "update") {
        if (!ai.update?.match && !Object.keys(ai.update?.fields ?? {}).length) {
          throw new AppError(422, "PARSE_FAILED", "Update missing match criteria");
        }
        const updated = await updateMatchedTransaction(
          userId,
          ai.update?.match || parsed.data.message,
          ai.update?.fields ?? {},
          parsed.data.message,
        );
        if (!updated) {
          res.json({
            action: "clarify",
            summary: "I couldn't find that transaction to update. Try being more specific.",
            transactions: [],
          });
          return;
        }
        res.json({
          action: "update",
          summary: ai.summary,
          transactions: [updated],
        });
        return;
      }

      if (!ai.items.length) {
        res.json({
          action: "clarify",
          summary: ai.summary || "I didn't find any transactions to log.",
          transactions: [],
        });
        return;
      }

      const created = await insertTransactions(userId, ai.items);
      res.json({
        action: "create",
        summary: ai.summary,
        transactions: created,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/transactions",
  requireAuth,
  requireSubscription,
  async (req, res, next) => {
    try {
      const { userId } = req as AuthedRequest;
      const transactions = await listTransactions(userId, 100);
      res.json({ transactions });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
