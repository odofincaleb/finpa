import express from "express";
import cors from "cors";
import aiRoutes from "./routes/ai.routes";
import meRoutes from "./routes/me.routes";
import pinsRoutes from "./routes/pins.routes";
import budgetsRoutes from "./routes/budgets.routes";
import adminPinsRoutes from "./routes/adminPins.routes";
import transactionsRoutes from "./routes/transactions.routes";
import checkoutRoutes from "./routes/checkout.routes";
import { AppError } from "./lib/errors";
import { hasSupabase } from "./lib/supabase";
import { parseSuperAdminEmails } from "./middleware/auth";

export function healthPayload() {
  return {
    ok: true,
    service: "finpa-backend",
    supabase: hasSupabase(),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    superadmins: parseSuperAdminEmails().length,
  };
}

export function createApp() {
  const app = express();
  // Belmo / reverse proxies send X-Forwarded-For
  app.set("trust proxy", 1);

  app.use(cors());
  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }));

  app.get("/", (_req, res) => {
    res.json(healthPayload());
  });

  app.get("/health", (_req, res) => {
    res.json(healthPayload());
  });

  app.use("/api/me", meRoutes);
  app.use("/api/pins", pinsRoutes);
  app.use("/api/budgets", budgetsRoutes);
  app.use("/api/admin/pins", adminPinsRoutes);
  app.use("/api/transactions", transactionsRoutes);
  app.use("/api/checkout", checkoutRoutes);
  app.use("/api", aiRoutes);

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof AppError) {
        res.status(err.status).json({ code: err.code, message: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ code: "INTERNAL", message: "Unexpected server error" });
    },
  );

  return app;
}
