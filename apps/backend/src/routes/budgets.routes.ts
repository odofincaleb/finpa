import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth, requireSubscription } from "../middleware/auth";
import { getBudgetsWithActuals, upsertBudgets } from "../services/database";
import { AppError } from "../lib/errors";

const router = Router();

router.get(
  "/:year/:month",
  requireAuth,
  requireSubscription,
  async (req, res, next) => {
    try {
      const { userId, profile } = req as AuthedRequest;
      const year = Number(req.params.year);
      const month = Number(req.params.month);
      if (!Number.isInteger(year) || month < 1 || month > 12) {
        throw new AppError(400, "VALIDATION_ERROR", "Invalid year/month");
      }
      const result = await getBudgetsWithActuals(
        userId,
        year,
        month,
        profile.preferred_currency,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

const putSchema = z.object({
  items: z.array(
    z.object({
      category: z.string().min(1).max(64),
      budget_amount: z.number().min(0),
    }),
  ),
});

router.put(
  "/:year/:month",
  requireAuth,
  requireSubscription,
  async (req, res, next) => {
    try {
      const { userId, profile } = req as AuthedRequest;
      const year = Number(req.params.year);
      const month = Number(req.params.month);
      if (!Number.isInteger(year) || month < 1 || month > 12) {
        throw new AppError(400, "VALIDATION_ERROR", "Invalid year/month");
      }
      const parsed = putSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "VALIDATION_ERROR", parsed.error.message);
      }
      await upsertBudgets(
        userId,
        year,
        month,
        profile.preferred_currency,
        parsed.data.items,
      );
      const result = await getBudgetsWithActuals(
        userId,
        year,
        month,
        profile.preferred_currency,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
