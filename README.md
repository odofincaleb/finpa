# FINPA — Financial Personal Assistant

Mobile personal finance app: chat or speak expenses, AI extracts structured ledger rows, expandable monthly budget vs actuals, email auth, and PIN-based monthly/annual activation.

## Stack

- **Mobile**: Expo (React Native) + TypeScript + NativeWind + Lucide
- **Backend**: Node.js + Express + TypeScript + OpenRouter
- **Data**: Supabase (Postgres, Auth, Realtime) — or in-memory fallback for local demos

## Monorepo

```text
apps/backend   Express API
apps/mobile    Expo Go app
supabase/      SQL migrations
scripts/       PIN generation helper
```

## 1. Backend

```bash
cp apps/backend/.env.example apps/backend/.env
# set OPENROUTER_API_KEY, ADMIN_SECRET
# optional: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

npm install
npm run dev:backend
```

Health: `http://localhost:3001/health`

Without Supabase, the API uses an in-memory store. Auth header format for the mobile **dev auth** mode:

`Authorization: Bearer dev:<userId>:<email>`

A demo PIN is seeded in memory mode: **`FINPA-DEMO-0001`** (monthly).

### Generate sellable PINs

```bash
# backend running, ADMIN_SECRET set
curl -X POST http://localhost:3001/api/admin/pins/generate \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -d "{\"period\":\"monthly\",\"count\":5}"
```

Or: `API_URL=http://localhost:3001 ADMIN_SECRET=... npx tsx scripts/generate-pins.ts monthly 10`

### Super Admin (in-app PIN CRUD)

1. Set in `apps/backend/.env`:
   ```env
   SUPERADMIN_EMAILS=you@example.com
   ```
2. Run notes migration once (SQL Editor):
   ```sql
   alter table public.activation_pins
     add column if not exists notes text not null default '';
   ```
   Or run [`supabase/migrations/004_pin_notes.sql`](supabase/migrations/004_pin_notes.sql).
3. Restart backend, sign in with that email → **Settings → Manage PINs**.
4. Generate / edit notes / delete unused / **Share** (WhatsApp, SMS, etc.) or Copy.

Super admins skip the Activate PIN screen. Scripts can still use `x-admin-secret` on `/api/admin/pins/*`.

## 2. Supabase (production-ready)

Docker is not required. Use a free project on [supabase.com](https://supabase.com).

1. Create a project (remember the database password).
2. **Authentication → Providers → Email**: enable Email. For local testing, turn **off** “Confirm email”.
3. **SQL Editor**: paste and run [`supabase/setup_all.sql`](supabase/setup_all.sql) (tables, RLS, realtime, demo PIN `FINPA-DEMO-0001`).
4. **Project Settings → API**: copy URL, `anon` key, and `service_role` key into env files:

```env
# apps/backend/.env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

5. Restart backend + Expo, then verify:

```bash
npm run supabase:check
```

Health should show `"supabase": true`. Sign up with a real email/password (Supabase Auth), then activate with `FINPA-DEMO-0001`.

### Auth email branding (FINPA, not “Supabase Auth”)

Supabase’s free mailer always shows **Supabase Auth** as the From name unless you add **custom SMTP**.

1. **Easiest for testing:** Authentication → Providers → Email → turn **off** “Confirm email” (no confirmation mail needed).
2. **Customize email body/subject:** Authentication → Email Templates → set titles to “Confirm your FINPA account”, etc.
3. **From name = FINPA:** Authentication → [SMTP settings](https://supabase.com/dashboard/project/_/auth/smtp) → enable custom SMTP (Resend, SendGrid, etc.) and set **Sender name** to `FINPA`.

## 3. Mobile (Expo Go — local)

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Set `EXPO_PUBLIC_API_URL` to your machine **LAN IP** when testing on a phone (not `localhost`), plus Supabase URL/anon key for real auth:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3001
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

```bash
npm run dev:mobile
```

Scan the QR code in **Expo Go**. Demo API URL / Demo PIN chrome only appears in local `__DEV__` builds.

### Live APK (EAS) — required setup

Supabase handles **auth** (and stores data). The phone still needs a **public FINPA backend** for PIN redeem, chat/AI, budgets, and ledger — a PC LAN IP will not work for users on mobile data.

1. **Host the API** (e.g. Render Blueprint via `render.yaml`):
   - Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `ADMIN_SECRET`, `SUPERADMIN_EMAILS`
   - Confirm `https://YOUR-SERVICE.onrender.com/health` returns `"supabase": true`
2. **Point the app at that API** (Expo → Project → Environment variables, for `preview` / `production`):
   - `EXPO_PUBLIC_API_URL=https://YOUR-SERVICE.onrender.com`
   - Supabase URL + anon key are already in `eas.json`
3. Rebuild:

```bash
npm run eas:build:apk
```

EAS builds **reject** localhost/LAN API URLs so a live APK cannot ship pointing at your PC.

### Voice (hold-to-talk mic)

Uses `expo-speech-recognition` (on-device / system STT). **Requires an EAS APK or development build** — Expo Go shows a fallback alert. On first use, allow **microphone**.

## Default currency

**NGN (Naira)**. Change anytime in Settings.

## API overview

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/me` | Bearer |
| PATCH | `/api/me` | Bearer |
| POST | `/api/pins/redeem` | Bearer |
| GET | `/api/admin/pins` | Superadmin JWT or `x-admin-secret` |
| POST | `/api/admin/pins/generate` | Superadmin JWT or `x-admin-secret` |
| PATCH | `/api/admin/pins/:code` | Superadmin JWT or `x-admin-secret` |
| DELETE | `/api/admin/pins/:code` | Superadmin JWT or `x-admin-secret` |
| GET/PUT | `/api/budgets/:year/:month` | Bearer + active sub |
| POST | `/api/chat-expense` | Bearer + active sub |
| GET | `/api/transactions` | Bearer + active sub |
