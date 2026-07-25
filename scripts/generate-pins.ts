/**
 * Generate activation PINs via the admin API.
 *
 * Usage:
 *   npx tsx scripts/generate-pins.ts monthly 10
 *   npx tsx scripts/generate-pins.ts annual 5
 *
 * Requires backend running, plus ADMIN_SECRET and API_URL (default http://localhost:3001).
 */
import "dotenv/config";

const period = (process.argv[2] ?? "monthly") as "monthly" | "annual";
const count = Number(process.argv[3] ?? "5");
const apiUrl = process.env.API_URL ?? "http://localhost:3001";
const adminSecret = process.env.ADMIN_SECRET;

if (!adminSecret) {
  console.error("Set ADMIN_SECRET in the environment.");
  process.exit(1);
}

if (!["monthly", "annual"].includes(period) || !Number.isFinite(count) || count < 1) {
  console.error("Usage: npx tsx scripts/generate-pins.ts <monthly|annual> <count>");
  process.exit(1);
}

async function main() {
  const res = await fetch(`${apiUrl}/api/admin/pins/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": adminSecret!,
    },
    body: JSON.stringify({ period, count }),
  });

  const body = await res.json();
  if (!res.ok) {
    console.error("Failed:", body);
    process.exit(1);
  }

  console.log(`Generated ${body.pins?.length ?? 0} ${period} PIN(s):\n`);
  for (const pin of body.pins ?? []) {
    console.log(`  ${pin.code}  (${pin.period}, ${pin.duration_days} days)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
