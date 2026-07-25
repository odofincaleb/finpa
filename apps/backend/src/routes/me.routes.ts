import { Router } from "express";
import { z } from "zod";
import {
  AuthedRequest,
  isSuperAdminEmail,
  requireAuth,
} from "../middleware/auth";
import { getProfile, isSubscriptionActive, updateProfile } from "../services/database";
import { CURRENCIES } from "../types/transaction";
import { AppError } from "../lib/errors";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { userId, userEmail, profile } = req as AuthedRequest;
    const fresh = await getProfile(userId, userEmail || profile.email);
    const email = userEmail || fresh.email;
    res.json({
      profile: fresh,
      subscriptionActive: isSubscriptionActive(fresh),
      isSuperAdmin: isSuperAdminEmail(email),
      currencies: CURRENCIES,
    });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  preferred_currency: z.enum(CURRENCIES).optional(),
});

router.patch("/", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    if (!parsed.data.preferred_currency) {
      throw new AppError(400, "VALIDATION_ERROR", "No updatable fields provided");
    }
    const profile = await updateProfile(userId, {
      preferred_currency: parsed.data.preferred_currency,
    });
    res.json({ profile, subscriptionActive: isSubscriptionActive(profile) });
  } catch (err) {
    next(err);
  }
});

export default router;
