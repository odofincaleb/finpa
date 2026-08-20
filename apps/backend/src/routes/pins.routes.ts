import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { pinRedeemLimiter } from "../middleware/rateLimit";
import { isSubscriptionActive, redeemPin } from "../services/database";
import { AppError } from "../lib/errors";

const router = Router();

const redeemSchema = z.object({
  code: z.string().min(4).max(64),
});

router.post("/redeem", pinRedeemLimiter, requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthedRequest;
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "PIN code is required");
    }
    const profile = await redeemPin(userId, parsed.data.code);
    res.json({
      profile,
      subscriptionActive: isSubscriptionActive(profile),
      summary: `Activated ${profile.subscription_period} plan until ${new Date(
        profile.subscription_expires_at!,
      ).toLocaleDateString()}`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
