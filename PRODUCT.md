# FINPA — Product Overview

**FINPA** (Financial Personal Assistant) is a mobile personal-finance app built for how people actually spend money day to day: quick notes, voice, and chat — not only spreadsheet forms.

It turns natural language (“Spent ₦4,500 on fuel at Mobil”) into structured ledger entries, tracks **budget vs actuals**, and supports **offline manual logging** with sync when the network returns. Access is monetized with **pre-generated monthly/annual PINs** (sellable codes), not card subscriptions in-app.

**Repo:** https://github.com/odofincaleb/finpa

---

## What FINPA is for

| Use | How |
|-----|-----|
| Log spending as you go | Chat, hold-to-talk mic, or Manual form |
| Stay within category budgets | Monthly budgets with live actuals and alerts |
| Ask affordability questions | Ask mode: “Can I afford ₦80,000 shoes?” |
| Review a month | Monthly summary + downloadable CSV statement |
| Sell / distribute access | Generate and share activation PINs (admin) |
| Use one phone, many accounts | Per-user local cache — ledgers stay separate |

---

## Core features

### Authentication & access

- **Email + password** sign-up / sign-in (Supabase Auth)
- **PIN activation** — redeem a monthly or annual code to unlock the app
- Subscription expiry visible in Settings
- **Super admins** can skip the PIN gate and manage codes in-app
- After a successful online login/activation, **offline cold start** restores Home from a cached auth snapshot (so Manual entry still works without the PIN screen)

### Capture money movements

- **Chat** — AI extracts amount, category, merchant, payment method, type (expense/income), notes
- **Ask FINPA** — budget-aware Q&A (remaining budget, affordability, spend overview)
- **Manual entry** — structured form; works **offline**
- **Hold-to-talk mic** — speech → text into chat (EAS APK / development build; not Expo Go)
- Income and expense both supported
- Default currency **NGN**, with USD, EUR, GBP, GHS, KES, ZAR

### Ledger & editing

- **Recent** on Home and full **Ledger**
- Tap a row to **edit or delete** (CRUD)
- Offline creates/edits/deletes queue and sync when online
- Pending rows labeled until synced

### Budgets & insights

- Monthly **category budgets** vs **actual spend**
- Custom expense categories
- Home **spending alert** cards when categories are tight or over
- **Monthly summary** — income, expenses, net, category breakdown, tips
- **CSV statement** download/share (opens in Excel / Google Sheets)

### Admin & operations

- In-app **PIN CRUD** for superadmins: generate, notes, filter/search, revoke unused, copy, share (WhatsApp/SMS/etc.)
- Backend APIs for PIN generation with admin secret (scripts / ops)
- Demo PIN for local/memory demos: `FINPA-DEMO-0001`

### Experience

- Light / dark themes
- Quick Tips for how to phrase chat entries
- Brand-forward mobile UI (logo, FINPA identity)

---

## How people use it (typical flows)

1. **Sign up** → activate with a purchased (or demo) PIN → set category budgets.
2. **During the day** — Manual entry offline on the bus; Chat/Ask when online; voice when using the APK.
3. **End of week** — open Ledger, fix a wrong category, delete a duplicate.
4. **End of month** — Monthly summary → download CSV for records or sharing with a partner/accountant.
5. **Seller / operator** — Settings → Manage PINs → generate codes, add notes, share to customers.

---

## Target audiences

### Primary

1. **Young professionals & salary earners (especially Nigeria / West Africa)**  
   Think in naira, transfer/POS cash culture, want speed over accounting jargon.

2. **Small business owners & traders**  
   Need a simple daily spend log and monthly statement without hiring a bookkeeper.

3. **Students & first-time budgeters**  
   Chat-first logging lowers the barrier vs traditional expense apps.

4. **Households sharing a phone**  
   Multiple logins on one device with **isolated** ledgers.

### Secondary

5. **FINPA operators / resellers** — sell monthly/annual PINs offline or via WhatsApp without app-store subscriptions.
6. **Partners / coaches** — review a shared CSV or summary with a client (client exports; no multi-user org yet).

---

## Competitive moat (why FINPA can win)

FINPA’s advantage is not “another budget app.” It is the **combination** of distribution, UX fit for the market, and control of access:

### 1. Chat + voice + offline Manual (capture moat)

Most finance apps assume forms and always-online behavior. FINPA matches real life:

- Speak or type in natural language when online  
- Keep logging manually when data is bad  
- Sync later without losing the day  

That loop is hard to copy well without offline queues, per-user cache, and AI fallback parsing.

### 2. PIN monetization (distribution moat)

Activation via **pre-generated PINs** fits markets where:

- Card / Play Billing friction is high  
- Cash / transfer / agent sales are normal  
- Codes can be sold in shops, campuses, churches, WhatsApp catalogs  

Operators keep **margin and relationship** with the customer. Superadmin PIN tools (generate, note, share) make that operational.

### 3. NGN-first, local UX (market fit moat)

Default naira, Nigerian English phrasing, transfer/POS-friendly capture — not a US app with currency bolted on. Trust and habit form faster in the primary market.

### 4. Vertical control of the stack (execution moat)

Owned path: **mobile → FINPA API → Supabase + OpenRouter**.  
You control auth, ledger, PIN inventory, and AI prompts — not locked into a generic no-code wallet or a single store billing model.

### 5. What is *not* the moat (be honest)

- OpenRouter models are not exclusive  
- Budgets and CSV are table stakes once the product is known  
- Defensibility grows with **PIN sales network**, **habit of chat logging**, and **localized brand** — not with features alone  

**Durable edge to build:** reseller/PIN channels + brand as “the chat money app for Naira users” + offline reliability.

---

## Product constraints (set expectations)

| Constraint | Detail |
|------------|--------|
| Chat / Ask need internet | Manual is the offline path |
| Voice needs APK / dev build | Not available in Expo Go |
| Live APK needs public HTTPS API | LAN/`localhost` will not work on mobile data |
| Per-user isolation | Ledgers are per account; device-shared theme only |

---

## Tech snapshot (for stakeholders)

| Layer | Choice |
|-------|--------|
| Mobile | Expo (React Native), TypeScript, EAS Android APK |
| API | Node.js + Express on Belmo (or similar) |
| Data / Auth | Supabase (Postgres + Auth + RLS) |
| AI | OpenRouter (with local parse fallback when AI fails) |
| Monetization | Activation PINs (monthly / annual) |

---

## Success metrics (suggested)

- Daily active loggers (chat + manual + voice)
- % of entries created offline then synced
- PIN redemption rate and renewals
- Time-to-first-entry after activate
- CSV exports per active subscriber / month

---

*FINPA — Financial Personal Assistant. Capture spend in the moment. Stay on budget. Own the channel.*
