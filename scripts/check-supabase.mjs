/**
 * Quick check that Supabase env vars work.
 * Usage (from repo root):
 *   node scripts/check-supabase.mjs
 * Reads apps/backend/.env and apps/mobile/.env
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const backend = loadEnv(path.join(root, "apps/backend/.env"));
const mobile = loadEnv(path.join(root, "apps/mobile/.env"));

const url = backend.SUPABASE_URL || mobile.EXPO_PUBLIC_SUPABASE_URL;
const service = backend.SUPABASE_SERVICE_ROLE_KEY;
const anon = mobile.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log("SUPABASE_URL:", url ? url : "(missing)");
console.log("SERVICE_ROLE:", service ? "set" : "(missing in apps/backend/.env)");
console.log("ANON_KEY:", anon ? "set" : "(missing in apps/mobile/.env)");

if (!url || !service) {
  console.error("\nAdd SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to apps/backend/.env");
  process.exit(1);
}

const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/profiles?select=id&limit=1`, {
  headers: {
    apikey: service,
    Authorization: `Bearer ${service}`,
  },
});

if (!res.ok) {
  const body = await res.text();
  console.error("\nSupabase REST check failed:", res.status, body.slice(0, 300));
  console.error("Did you run supabase/setup_all.sql in the SQL Editor?");
  process.exit(1);
}

console.log("\nOK — Supabase reachable and profiles table exists.");
