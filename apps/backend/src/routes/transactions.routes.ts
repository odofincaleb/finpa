import { Router } from "express";
import { z } from "zod";
import {
  AuthedRequest,
  requireAuth,
  requireSubscription,
} from "../middleware/auth";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransactionById,
} from "../services/database";
import { AppError } from "../lib/errors";
const router = Router();

const writeSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(3).max(8).optional(),
  category: z.string().min(1).max(64),
  merchant: z.string().min(1).max(120).optional().default("Unknown"),
  type: z.enum(["expense", "income"]),
  payment_method: z.string().max(64).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  created_at: z.string().min(10).max(40).optional(),
  client_id: z.string().max(80).optional(),
});

const patchSchema = writeSchema.partial().refine(
  (v) => Object.keys(v).some((k) => k !== "client_id"),
  { message: "At least one field is required" },
);

router.get("/", requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const transactions = await listTransactions(userId, 200);
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { userId, profile } = req as AuthedRequest;
    const parsed = writeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid transaction payload");
    }
    const body = parsed.data;
    const transaction = await createTransaction(userId, {
      amount: body.amount,
      currency: body.currency ?? profile.preferred_currency,
      category: body.type === "income" ? "Income" : body.category,
      merchant: body.merchant || "Unknown",
      type: body.type,
      payment_method: body.payment_method || "",
      notes: body.notes || "",
      created_at: body.created_at,
    });
    res.status(201).json({
      transaction,
      client_id: body.client_id ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const id = String(req.params.id || "");
    if (!id) throw new AppError(400, "VALIDATION_ERROR", "id required");

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid update payload");
    }

    const patch = { ...parsed.data };
    delete (patch as { client_id?: string }).client_id;
    if (patch.type === "income") patch.category = "Income";

    const transaction = await updateTransactionById(userId, id, patch);
    res.json({ transaction });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const id = String(req.params.id || "");
    if (!id) throw new AppError(400, "VALIDATION_ERROR", "id required");
    await deleteTransaction(userId, id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
