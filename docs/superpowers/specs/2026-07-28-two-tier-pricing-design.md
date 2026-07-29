# OneTime SEO — Two-Tier Pricing (Subscription Credits + Lifetime BYOK) — Design

Date: 2026-07-28
Status: Approved by user 2026-07-28 (top-ups gated to the $30/month tier).

## Summary

Add a second tier to OneTime SEO alongside the existing BYOK model:

- **Subscription: $30/month** — DataForSEO data included (operator's shared key),
  metered against a fixed monthly credit bundle that resets every month (no
  rollover), with one-time top-up credit packs at the same per-credit price.
- **Lifetime: $599 one-time** — bring your own DataForSEO key (current behavior).
- Existing **$199** buyers are grandfathered as lifetime/BYOK.
- A **public landing page** at `https://seo.onetimesuite.com` presents both plans
  and routes buyers through Whop checkout → Whop sign-in.

## Decisions (confirmed with user 2026-07-28)

- Allowance model: fixed credit bundle + purchasable top-ups at the same price.
- **Top-ups require an active $30/month subscription** (user constraint): credit
  purchases and the Credits UI exist only for the subscription tier. BYOK/lifetime
  members use their own key and never see credit mechanics.
- $199 plan: grandfathered (kept active, hidden from new buyers), treated as BYOK tier.
- Justin (jonesyjones1982@gmail.com): comped lifetime BYOK membership via Whop dashboard.

Status: **Approved by user 2026-07-28** (with the top-up-requires-subscription
constraint above).

## Credit economics (proposed defaults — correct me if wrong)

- **1 credit = $0.01 of marked-up DataForSEO cost** (raw API cost × 3, in cents).
  Equivalently: **$1 = 100 credits**, always the same price.
- Monthly bundle: **3,000 credits/month** (= $10 of raw DataForSEO spend at 3× markup).
- Top-ups (user-confirmed 2026-07-28): preset packs **$10 / $20 / $50 / $100 /
  $250 / $1000** (1,000 / 2,000 / 5,000 / 10,000 / 25,000 / 100,000 credits) plus a
  **custom amount** option. Top-up credits **do not expire** (paid-for credits; the
  no-accumulation rule applies only to the monthly bundle).
- Crediting rule: `credits = paid_amount_cents` — works uniformly for preset packs
  and custom amounts, driven by the amount in the Whop payment webhook.
- Deduction order on each metered call: monthly bucket first, then top-up bucket —
  mirroring the upstream split logic (see `dataforseoBillingClassification.test.ts`).

## Whop configuration

Same product (`prod_bhzt0w68pMpXI`), four plans total:

| Plan | Price | Tier | Notes |
|---|---|---|---|
| existing $199 one-time (`plan_LBrhuz3LSe743`) | $199 | byok | grandfathered, set visibility hidden |
| new: Lifetime | $599 one-time | byok | primary lifetime offer |
| new: Monthly | $30/mo subscription | subscription | primary sub offer |
| new: Credit Top-Up — six one-time plans ($10/$20/$50/$100/$250/$1000) | per pack | topup | one product "OneTime SEO Credit Top-Up", one plan per amount |

Custom amounts: a **Custom** option in the app's buy-credits UI creates a Whop
checkout session via API for the typed amount (verify the checkout-sessions
endpoint supports custom amounts during implementation; fallback = nearest
preset tier). Crediting is amount-driven (`credits = paid_amount_cents`), so
preset and custom paths land identically in the webhook.

Access check (`src/server/lib/whop/access.ts`) currently returns boolean
has_access for the product. Extend to also return the member's **plan_id(s)**
(Whop memberships API filtered by user+product) so the app can resolve tier:
byok | subscription. Cache with the same 1h TTL + outage grace. Top-up
**payments** (not memberships) arrive via a new Whop webhook.

## Server changes

1. **Credit ledger** (D1 + pg dual schemas, drizzle migrations):
   `organization_credit_balance(organization_id PK, monthly_credits int,
   monthly_period_start text, topup_credits int, updated_at text)`.
2. **Metering**: `meterDataforseoCall` already computes raw cost and currently
   no-ops billing outside hosted mode. Add a whop-mode branch: compute
   `credits = ceil(rawCostUsd * 3 * 100)`, deduct monthly-then-topup; on
   insufficient balance throw `INSUFFICIENT_CREDITS` (error type already exists
   in the upstream billing code path — reuse the UX).
3. **Monthly reset**: existing cron trigger (`*/15 * * * *` → scheduledRankChecks)
   gains a monthly-reset step: if now crosses the org's `monthly_period_start +
   1 month`, set `monthly_credits = 3000`, advance period. Top-up bucket untouched.
4. **Key resolution** (`resolveDataforseoApiKey`): subscription-tier orgs use the
   shared `DATAFORSEO_API_KEY` env (operator sets it in Coolify); byok orgs use
   their stored key as today. Tier comes from the Whop membership check.
5. **Whop webhook** (`POST /api/whop/webhook`, signature-verified with a webhook
   secret env): on successful payment for any top-up plan or custom checkout
   session, credit `topup_credits += paid_amount_cents` for the buyer's org
   (resolve org from whop user id via the account table). Idempotent on payment id.
6. **Balance/status serverFns**: current balance, monthly reset date, usage
   history-lite for a Settings → Credits section (buy top-up button → Whop
   checkout for the top-up plan).

## Client changes

1. **Public landing page** at `/` for signed-out visitors: OneTime SEO pitch,
   two pricing cards ($30/mo credits, $599 lifetime BYOK) → Whop checkout URLs,
   "Sign in with Whop". Signed-in members skip it into the app; signed-in
   non-members land here instead of the single-checkout bounce.
2. **Settings → Credits** (subscription tier only): monthly bundle remaining,
   reset date, top-up balance, Buy Credits button.
3. **Insufficient-credits UX**: reuse the existing hosted billing gate
   components (modal → Settings → Credits) instead of Autumn subscribe route.
4. Non-member bounce (`useWhopAccessGuard`) → landing page, not a raw checkout URL.

## Deployment/config

- New env: `WHOP_WEBHOOK_SECRET`, `WHOP_TOPUP_PRODUCT_ID` (if separate product),
  `DATAFORSEO_API_KEY` (operator's shared key, required for subscription tier).
- Whop dashboard: create the three new plans, hide $199, configure webhook URL.
- Landing page is same-origin — no DNS changes.

## Out of scope

- Proration on plan upgrade/downgrade mid-cycle (Whop handles money; credits
  reset on the plan's own monthly anchor).
- Annual billing, team seats, usage-based invoicing beyond the credit model.
- Changes to onetimesuite.com's catalog (separate task).

## Testing

- Unit: credit math + deduction order (monthly→topup), reset boundary
  conditions, tier resolution from plan_ids, webhook signature + idempotency,
  key resolution per tier.
- E2E: comp Justin (byok) signs in and uses his key; a subscription-tier test
  membership meters calls against the bundle, blocks at 0, resets, and a top-up
  purchase credits the balance via webhook.
