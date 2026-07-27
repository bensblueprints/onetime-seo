# OneTime SEO — Rebrand & Whop-Gated Hosted Release — Design

Date: 2026-07-27
Status: Approved by user (2026-07-27)

## Summary

Rebrand the open-source `every-app/open-seo` project as **OneTime SEO**, part of
**OneTimeSuite.com**, sell it on Whop for a **$199 one-time price**, and host it as a
multi-tenant app gated by Whop OAuth. Buyers bring their own DataForSEO API key.
Composio is used to automate the Whop product setup. Deployed on Coolify
(212.28.184.24) at `seo.onetimesuite.com` per the user's CLAUDE.md hosting rules.

Source repo: https://github.com/every-app/open-seo (MIT). Local clone:
`C:/Users/HP/projects/onetime-seo`. Stack: Vite + React (TanStack Router), better-auth,
Drizzle (Postgres for Docker self-host path), pnpm.

## Decisions (locked with user)

- Delivery: hosted app on Coolify, Whop-gated.
- Composio role: automate Whop product/listing setup only (not runtime integrations).
- DataForSEO usage cost: buyers bring their own key (BYOK), stored per-user.
- Access verification: Whop OAuth login + server-side active-membership check
  (Approach A — via better-auth `genericOAuth`).
- Domain: `seo.onetimesuite.com`.

## 1. Product & rebrand scope

All existing features stay: keyword research, rank tracking, competitor insights,
backlinks, site audits, AI visibility, MCP/agent skills.

Rebrand covers:

- App name/wordmark: OpenSEO → OneTime SEO ("part of OneTimeSuite.com").
- Login and in-app marketing copy.
- All `openseo.so`, Discord, and X links → `onetimesuite.com` and the Whop checkout URL.
- Remove the "$10/month hosted" pitch and the anonymous-usage-heartbeat startup notice
  in `Dockerfile.selfhost`.
- MIT license attribution to the original project is retained (license requirement).

## 2. Whop product ($199) via Composio

- Use Composio's Whop integration to create the **OneTime SEO** product on the user's
  Whop company: one-time price **$199**, checkout copy matching OneTimeSuite branding.
- Prerequisites: user's Composio API key and a connected Whop account. If not
  configured, stop and ask the user at that step.
- Whop OAuth app credentials (client ID/secret, needed in §3) are created in the Whop
  developer dashboard. If Composio cannot automate that piece, deliver exact
  click-path instructions to the user.

## 3. Whop OAuth gating

- Add Whop as a `genericOAuth` provider in `src/lib/auth-config.ts`, alongside the
  existing Google provider. Login screen shows "Sign in with Whop".
- After the OAuth callback, the server calls the Whop API (company API key) to verify
  the user holds an **active membership** for the OneTime SEO product ID. Result is
  cached (~1 hour TTL) to avoid per-request latency.
- Members proceed into the existing signup flow (workspace/org creation already
  exists server-side).
- Non-members are redirected to the $199 Whop checkout.
- Whop API unreachable → cached memberships get a grace window; users with no cached
  result see a "couldn't verify, retry" page (no lockout-by-outage).

## 4. Per-user DataForSEO keys (BYOK)

Current behavior: self-host build reads one instance-wide `DATAFORSEO_API_KEY` env var
(`src/server/lib/dataforseo/core.ts:70`).

Changes:

- New encrypted `dataforseo_api_key` column on the **organization** table (Postgres
  schema) — DataForSEO usage is per workspace, matching the app's per-org billing
  model. Encrypted at rest like the existing OAuth tokens, key derived from
  `BETTER_AUTH_SECRET`.
- Settings field in `src/routes/_app/settings.tsx` to save and test the key.
- Key resolution in `core.ts`: current user's stored key → env fallback → clear error.
- Autumn billing/credits paths left unconfigured; the subscribe route is hidden in
  this deployment mode.

## 5. Deployment

- Push repo to GitHub as `bensblueprints/onetime-seo`. Note: `gh` CLI is not installed
  on this machine — needs user push credentials or the user pushes it.
- Coolify project "OneTime SEO" on `212.28.184.24`, Dockerfile build-pack using the
  existing `Dockerfile.selfhost` plus a Postgres service.
- Env vars: `BETTER_AUTH_SECRET`, Whop client ID/secret, Whop API key, Whop product
  ID, database URL.
- DNS: `seo.onetimesuite.com` → `212.28.184.24` (Cloudflare, proxied), per CLAUDE.md.
- Obsidian vault notes to be updated per CLAUDE.md; vault is not present on this
  machine, so record what needs writing back and flag it to the user.

## 6. Error handling

- Whop OAuth failure/cancel → back to login with a message.
- No active membership → redirect to checkout (cached, so flapping purchases don't
  bounce users mid-session).
- Whop API down → §3 grace behavior.
- Missing/invalid DataForSEO key → existing error-message surface
  (`src/client/lib/error-messages.ts`) pointing to the settings page.
- Unauthenticated → Whop login screen.

## 7. Testing

- Vitest unit tests:
  - Membership check: active / expired / none / API-unreachable (grace path).
  - DataForSEO key resolution order: user key → env fallback → error.
- Manual E2E: purchase with a test membership → sign in with Whop → save a personal
  DataForSEO key → run a keyword lookup.

## 8. Out of scope

- Changes to onetimesuite.com's own catalog page (optional follow-up).
- MCP/agent-skills docs rebrand beyond name/link changes.
- Mobile apps.
