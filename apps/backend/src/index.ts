import path from "path";
import { config as loadEnv } from "dotenv";
import express from "express";

// Always load apps/backend/.env (works whether started from repo root or package dir)
loadEnv({ path: path.resolve(__dirname, "../.env") });
loadEnv({ path: path.resolve(process.cwd(), "apps/backend/.env") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import cors from "cors";
import aiRoutes from "./routes/ai.routes";
import meRoutes from "./routes/me.routes";
import pinsRoutes from "./routes/pins.routes";
import budgetsRoutes from "./routes/budgets.routes";
import adminPinsRoutes from "./routes/adminPins.routes";
import transactionsRoutes from "./routes/transactions.routes";
import { AppError } from "./lib/errors";
import { hasSupabase } from "./lib/supabase";
import { parseSuperAdminEmails } from "./middleware/auth";
import { memorySeedDemoPin } from "./services/memoryStore";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function healthPayload() {
  return {
    ok: true,
    service: "finpa-backend",
    supabase: hasSupabase(),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    superadmins: parseSuperAdminEmails().length,
  };
}

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

app.listen(port, "0.0.0.0", () => {
  console.log(`FINPA backend listening on http://0.0.0.0:${port}`);
  if (!hasSupabase()) {
    memorySeedDemoPin();
    console.warn(
      "[finpa] Supabase not configured — using in-memory store. Auth: Bearer dev:<userId>:<email>",
    );
    console.warn("[finpa] Demo PIN (memory mode): FINPA-DEMO-0001");
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn("[finpa] OPENROUTER_API_KEY missing — AI routes will fail until set.");
  }
  const admins = parseSuperAdminEmails();
  if (admins.length) {
    console.log(`[finpa] Super admins: ${admins.join(", ")}`);
  } else {
    console.warn(
      "[finpa] SUPERADMIN_EMAILS unset — in-app PIN admin disabled (x-admin-secret still works).",
    );
  }
});
