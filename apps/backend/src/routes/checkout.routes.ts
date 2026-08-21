import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { renderPaystackSuccessPage } from "../lib/paystackSuccessPage";
import {
  initializePaystackCheckout,
  processVerifiedPaystackPurchase,
  verifyFinpaRouterSecret,
  verifyPaystackWebhookSignature,
} from "../services/payments";
import rateLimit from "express-rate-limit";

const router = Router();

const checkoutSchema = z.object({
  plan_id: z.string().min(1).max(80),
  buyer_email: z.string().email(),
  buyer_name: z.string().max(120).optional(),
  buyer_phone: z.string().max(40).optional(),
  callback_url: z.string().url().optional(),
});

router.use(rateLimit({ windowMs: 60 * 1000, max: 30 }));

router.post("/paystack/initialize", async (req, res, next) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", parsed.error.message);
    const checkout = await initializePaystackCheckout({
      planId: parsed.data.plan_id,
      buyerEmail: parsed.data.buyer_email,
      buyerName: parsed.data.buyer_name,
      buyerPhone: parsed.data.buyer_phone,
      callbackUrl: parsed.data.callback_url,
    });
    res.json({ checkout });
  } catch (err) {
    next(err);
  }
});

router.get("/paystack/verify/:reference", async (req, res, next) => {
  try {
    const sale = await processVerifiedPaystackPurchase(req.params.reference);
    res.json({
      ok: true,
      reference: sale.paystack_reference,
      email: sale.buyer_email,
      plan_id: sale.plan_id,
      period: sale.period,
      currency: sale.currency,
      amount_paid: sale.amount_paid,
      email_status: sale.email_status,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/paystack/success", async (req, res, next) => {
  try {
    const reference = String(req.query.reference || "").trim();
    if (!reference) throw new AppError(400, "VALIDATION_ERROR", "Missing Paystack reference");
    const sale = await processVerifiedPaystackPurchase(reference);
    res.status(200).type("html").send(renderPaystackSuccessPage(sale));
  } catch (err) {
    next(err);
  }
});

router.post("/paystack/webhook", async (req, res, next) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
    const signature = req.header("x-paystack-signature") || undefined;
    const routerSecret = req.header("x-finpa-router-secret") || undefined;
    const hasValidPaystackSignature = Boolean(
      rawBody && verifyPaystackWebhookSignature(rawBody, signature),
    );
    const hasValidRouterSecret = verifyFinpaRouterSecret(routerSecret);

    if (!hasValidPaystackSignature && !hasValidRouterSecret) {
      throw new AppError(401, "PAYSTACK_SIGNATURE_INVALID", "Invalid Paystack signature or router secret");
    }

    const event = req.body as {
      event?: string;
      data?: { reference?: string; status?: string };
    };
    if (event.event === "charge.success" && event.data?.reference) {
      const sale = await processVerifiedPaystackPurchase(event.data.reference);
      res.json({
        ok: true,
        reference: sale.paystack_reference,
        email_status: sale.email_status,
      });
      return;
    }
    res.json({ ok: true, ignored: true });
  } catch (err) {
    next(err);
  }
});

export default router;
