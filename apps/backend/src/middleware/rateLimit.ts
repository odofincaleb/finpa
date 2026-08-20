import rateLimit from "express-rate-limit";

export const chatExpenseLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    code: "RATE_LIMIT",
    message: "Too many AI requests. Wait a moment and try again.",
  },
});

export const pinRedeemLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    code: "RATE_LIMIT",
    message: "Too many PIN attempts. Try again later.",
  },
});
