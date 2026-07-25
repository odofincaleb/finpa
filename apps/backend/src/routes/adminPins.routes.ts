import { Router } from "express";
import { z } from "zod";
import { requireSuperAdminOrSecret } from "../middleware/auth";
import {
  deletePin,
  generatePins,
  getPin,
  listPins,
  updatePin,
} from "../services/database";
import { AppError } from "../lib/errors";

const router = Router();

const generateSchema = z.object({
  period: z.enum(["monthly", "annual"]),
  count: z.number().int().min(1).max(200),
  notes: z.string().max(200).optional(),
});

const patchSchema = z.object({
  period: z.enum(["monthly", "annual"]).optional(),
  duration_days: z.number().int().min(1).max(3660).optional(),
  expires_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(200).optional(),
});

router.use(requireSuperAdminOrSecret);

router.get("/", async (req, res, next) => {
  try {
    const statusRaw = String(req.query.status || "all");
    const status =
      statusRaw === "unused" || statusRaw === "redeemed" || statusRaw === "all"
        ? statusRaw
        : "all";
    const periodRaw = String(req.query.period || "all");
    const period =
      periodRaw === "monthly" || periodRaw === "annual" || periodRaw === "all"
        ? periodRaw
        : "all";
    const search = String(req.query.q || "").slice(0, 80);
    const limit = Number(req.query.limit || 100);
    const pins = await listPins(
      status,
      Number.isFinite(limit) ? limit : 100,
      search,
      period,
    );
    res.json({ pins });
  } catch (err) {
    next(err);
  }
});

router.get("/:code", async (req, res, next) => {
  try {
    const pin = await getPin(req.params.code);
    if (!pin) throw new AppError(404, "NOT_FOUND", "PIN not found");
    res.json({ pin });
  } catch (err) {
    next(err);
  }
});

router.post("/generate", async (req, res, next) => {
  try {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    const pins = await generatePins(
      parsed.data.period,
      parsed.data.count,
      parsed.data.notes ?? "",
    );
    res.json({ pins });
  } catch (err) {
    next(err);
  }
});

router.patch("/:code", async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    if (
      !parsed.data.period &&
      parsed.data.duration_days == null &&
      parsed.data.expires_at === undefined &&
      parsed.data.notes === undefined
    ) {
      throw new AppError(400, "VALIDATION_ERROR", "No updatable fields provided");
    }
    const pin = await updatePin(req.params.code, parsed.data);
    res.json({ pin });
  } catch (err) {
    next(err);
  }
});

router.delete("/:code", async (req, res, next) => {
  try {
    await deletePin(req.params.code);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
