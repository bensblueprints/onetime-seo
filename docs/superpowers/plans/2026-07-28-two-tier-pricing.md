# OneTime SEO — Two-Tier Pricing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Steps use checkbox syntax. Spec: `docs/superpowers/specs/2026-07-28-two-tier-pricing-design.md` (approved 2026-07-28).

**Goal:** $30/mo subscription tier with monthly-resetting credit bundle + top-up packs ($10–$1000 + custom), alongside the existing BYOK lifetime tier ($599 new / $199 grandfathered), plus a public landing page.

**Whop setup — DONE 2026-07-28 (do not recreate):**
- Product `prod_bhzt0w68pMpXI` "OneTime SEO": Lifetime `plan_EF4Wcn4KXZSAM` ($599), Monthly `plan_KfGwx4oa2R7Eb` ($30/mo, billing_period 30), $199 `plan_LBrhuz3LSe743` now hidden (grandfathered, tier byok).
- Product `prod_SPJGcRRMsPL0R` "OneTime SEO Credits" (hidden): plans $10 `plan_cvRBoCPxf8BF6`, $20 `plan_C4jysvVVEXZd4`, $50 `plan_0PRaiphubYWhZ`, $100 `plan_hvT0u8ip7cXEC`, $250 `plan_qDxKezVJIQ2Zq`, $1000 `plan_4bhJvqwttrdDo`.
- Checkout URLs: `https://whop.com/checkout/plan_<id>`.

**New env vars:** `WHOP_MONTHLY_PLAN_ID=plan_KfGwx4oa2R7Eb`, `WHOP_TOPUP_PRODUCT_ID=prod_SPJGcRRMsPL0R`, `WHOP_WEBHOOK_SECRET` (generated at webhook registration), `DATAFORSEO_API_KEY` (operator shared key — required for the subscription tier). `WHOP_CHECKOUT_URL` becomes obsolete → landing page.

**Key facts for implementers:**
- `src/server/lib/whop/access.ts` — membership check (company API key, 1h cache + grace). Extend to return plan ids.
- `src/server/lib/dataforseo/client.ts` — `meterDataforseoCall` computes exact raw cost; billing currently no-ops outside hosted mode (`isHostedServerAuthMode`). Upstream Autumn split-bucket logic + tests live in `src/server/billing/subscription.ts` and `src/server/lib/dataforseoBillingClassification.test.ts` — mirror that logic internally.
- Auth context carries `organizationId` everywhere via `requireAuthenticatedContext`.
- Cron: `src/server/features/rank-tracking/services/scheduledRankChecks.ts` runs on `*/15 * * * *`.
- better-auth `account` table maps whop `sub` (accountId, providerId "whop") → userId; org via the whop ensure-user middleware.
- DB: drizzle dual schemas — sqlite (`src/db/*.schema.ts` + `drizzle/`) and pg (`src/db/pg/` + `drizzle-pg/`). Migrations: `pnpm db:generate` (check package.json scripts); sqlite applied at container boot via `wrangler d1 migrations apply DB --local`.

## Tasks

- [ ] **Task 1: Tier-aware membership check.** `checkWhopProductAccess` returns `{ hasAccess, tier, planIds }` where tier = byok | subscription, resolved via plan_id (monthly plan id from env → subscription; any other active plan on the product → byok). Uses Whop memberships list API filtered by user (+product) with company key; same cache/grace envelope. Update `tryResolveWhopContext`/`resolveWhopContext` to pass tier through `EnsuredUserContext` (add `whopTier`). Unit tests: monthly→subscription, lifetime→byok, $199→byok, none→denied, API-down grace.

- [ ] **Task 2: Credit ledger schema.** Table `organization_credit_balance` (organizationId PK, monthlyCredits int default 0, monthlyPeriodStart text ISO, topupCredits int default 0, updatedAt text) in both dialect schemas + migrations (sqlite 0038, pg 0015), following the Task 7 pattern. Add to schema barrel (`src/db/schema.ts`) both sides; extend `schema-parity.test.ts` expectations if it enumerates tables.

- [ ] **Task 3: Credit service.** `src/server/features/credits/creditsService.ts`: `getOrCreateBalance(orgId)` (first touch for a subscription org seeds monthlyCredits=3000, periodStart=now), `deductCredits(orgId, amount)` (monthly→topup split, throws AppError INSUFFICIENT_CREDITS with balance info), `resetMonthlyIfDue(orgId, now)` (anchor = periodStart + 30d; topup untouched), `addTopupCredits(orgId, credits)`. Constants: MONTHLY_BUNDLE_CREDITS=3000, MARKUP=3 (credits = ceil(rawCostUsd * MARKUP * 100)). Unit tests mirroring `dataforseoBillingClassification.test.ts` scenarios + reset boundaries.

- [ ] **Task 4: Metering integration.** In `meterDataforseoCall`'s non-hosted branch: resolve whop tier (from context); subscription → deduct via creditsService (subscription orgs use shared env key — verify `resolveDataforseoApiKey` already falls back to env when no org key; make tier explicit: subscription orgs must NOT require an org key); byok → current path. Tests: subscription deducts, byok untouched, insufficient blocks the call.

- [ ] **Task 5: Monthly reset cron.** Add a step in the scheduled run (same file as rank checks): iterate subscription-tier org balances, `resetMonthlyIfDue`. Must be idempotent and cheap (single UPDATE with WHERE period boundary). Test via service-level tests (no cron harness needed).

- [ ] **Task 6: Whop webhook.** Route `POST /api/whop/webhook`: verify HMAC signature with `WHOP_WEBHOOK_SECRET` (check Whop docs for header name/format — verify against docs.whop.com webhooks reference), handle payment success events for plans on `WHOP_TOPUP_PRODUCT_ID` (and custom checkout sessions if used): resolve whop user → userId → org, `addTopupCredits(org, paid_amount_cents)`, idempotent via payment id (store processed payment ids on the balance row or a small table). 401 on bad signature, 200 idempotent replay. Tests with signed fixtures.

- [ ] **Task 7: Credits serverFns + Settings UI.** `getCreditsBalance` (balance, reset date, topup), `createTopupCheckout(amountUsd)` (preset → return `https://whop.com/checkout/plan_<id>`; custom → attempt Whop checkout-session API for the typed amount, fallback nearest preset with a toast note). Settings → Credits section (subscription tier only): bundle remaining / reset date / topup balance / preset pack buttons + custom amount field. Follow the Task 10 settings-section pattern EXACTLY (createServerFn handlers only, no plain exported helpers touching server modules — that broke the client bundle once already).

- [ ] **Task 8: Landing page.** Public `/` for signed-out users and signed-in non-members: OneTime SEO hero, two pricing cards ($30/mo — credits incl.; $599 lifetime — BYOK), each linking to its Whop checkout, "Sign in with Whop" button. `useWhopAccessGuard` non-member bounce → `/` (landing), not raw checkout. Signed-in members redirect into the app. Match existing design system (daisyUI, onetime-seo-logo.svg). Update the sign-in route's redirects accordingly.

- [ ] **Task 9: Insufficient-credits UX.** Where AppError INSUFFICIENT_CREDITS surfaces in the client (error-messages.ts + feature gates), add a "Buy credits" action → Settings → Credits (subscription tier). Reuse existing gate/modal components; no Autumn references.

- [ ] **Task 10: Deploy + ops.** Update `compose.onetime-seo.yaml` env list (new vars), set Coolify envs via API, register the Whop webhook (POST /api/v1/webhooks → https://seo.onetimesuite.com/api/whop/webhook, payment events; record WHOP_WEBHOOK_SECRET into Coolify env), set operator `DATAFORSEO_API_KEY` (ask user), redeploy, verify.

- [ ] **Task 11: E2E.** Justin (byok comp) signs in → uses own key (works, no credits UI). Subscription test membership → metering deducts → blocks at 0 → reset → top-up credits via webhook (fire a real $10 test payment or a signed test webhook payload). Landing page renders signed-out.

## Self-review notes

- Spec coverage: tiers→T1; ledger→T2/T3; metering→T4; reset→T5; topups incl. custom→T6/T7; landing→T8; insufficient UX→T9; grandfathering→T1 (plan_id mapping treats unknown plans as byok); topup-requires-subscription→T7 (UI) + T6 (webhook credits any org but only subscription orgs have a metered path — note: if a byok org somehow tops up, credits sit unused; acceptable, document it).
- The client-bundle rule from the 40697ae incident applies to T7/T8: all server-module references inside createServerFn handlers only.
