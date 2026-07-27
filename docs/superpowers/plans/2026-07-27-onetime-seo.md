# OneTime SEO — Rebrand & Whop-Gated Hosted Release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the open-seo fork into "OneTime SEO" (OneTimeSuite.com), gated by Whop OAuth with a $199 one-time product, per-org DataForSEO keys, deployed on Coolify at seo.onetimesuite.com.

**Architecture:** New `AUTH_MODE="whop"` in the existing better-auth/TanStack Start app. Whop is added as a `genericOAuth` provider (OAuth 2.1 + PKCE + OIDC, endpoints at `https://api.whop.com/oauth/`). After login, a server-side access check (`GET https://api.whop.com/api/v1/users/{id}/access/{resource_id}`, company API key, cached 1h) gates every server function; non-members are sent to the Whop checkout. DataForSEO key resolution becomes per-organization (encrypted column, env var as fallback). Docker self-host build deploys to Coolify.

**Tech Stack:** TypeScript, Vite + React + TanStack Router/Start, better-auth (genericOAuth), Drizzle (sqlite + pg dual schemas), vitest, Docker, Whop API, Composio (Whop product setup only).

## Global Constraints

- Product name everywhere user-visible: **OneTime SEO** (tagline context: part of OneTimeSuite.com).
- Price: **$199 one-time** (never monthly/subscription copy).
- All `openseo.so` links replaced; support/about links point to `https://onetimesuite.com` and the Whop checkout URL.
- MIT attribution to `every-app/open-seo` stays in LICENSE and README.
- Existing auth modes (`cloudflare_access`, `local_noauth`, `hosted`) must keep working; existing tests must stay green (`pnpm test`).
- Whop OAuth endpoints (verified against docs.whop.com 2026-07):
  - authorize: `https://api.whop.com/oauth/authorize`
  - token: `https://api.whop.com/oauth/token`
  - userinfo: `https://api.whop.com/oauth/userinfo` (returns `sub` = `user_xxx`, `email`, `name`)
  - access check: `GET https://api.whop.com/api/v1/users/{user_id}/access/{resource_id}` → `{ has_access, access_level }`, header `Authorization: Bearer <WHOP_API_KEY>`
- New env vars: `WHOP_CLIENT_ID` (`app_xxx`), `WHOP_CLIENT_SECRET`, `WHOP_API_KEY`, `WHOP_PRODUCT_ID` (`prod_xxx`), `WHOP_CHECKOUT_URL`.
- Dual-schema rule: every DB change is made in BOTH `src/db/better-auth-schema.ts` (sqlite) and `src/db/pg/better-auth-schema.ts` (pg); `src/db/schema-parity.test.ts` enforces this. Migrations are generated with `pnpm db:generate:d1` and `pnpm db:generate:pg`.
- Tests follow existing patterns: mock `cloudflare:workers` with `vi.mock("cloudflare:workers", () => ({ env: {} }))`; mock `@/server/lib/runtime-env` for env values; `vi.stubGlobal("fetch", ...)` for HTTP.
- Run tests with `pnpm test` (or `pnpm vitest run <file>` for one file). Typecheck with `pnpm types:check`.

---

### Task 1: Add `whop` auth mode

**Files:**
- Modify: `src/lib/auth-mode.ts`
- Modify: `src/env.d.ts` (lines 15 and 51: the two `AUTH_MODE` unions)
- Test: `src/lib/auth-mode.test.ts` (create)

**Interfaces:**
- Produces: `isWhopAuthMode(value: string | null | undefined): boolean`, `isWhopClientAuthMode(): boolean`; `AuthMode` now includes `"whop"`. All later tasks consume these.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth-mode.test.ts
import { describe, expect, it } from "vitest";
import { getAuthMode, isWhopAuthMode } from "./auth-mode";

describe("whop auth mode", () => {
  it("parses whop as a valid mode", () => {
    expect(getAuthMode("whop")).toBe("whop");
  });

  it("isWhopAuthMode is true only for whop", () => {
    expect(isWhopAuthMode("whop")).toBe(true);
    expect(isWhopAuthMode("hosted")).toBe(false);
    expect(isWhopAuthMode(undefined)).toBe(false);
  });

  it("still falls back to cloudflare_access for garbage", () => {
    expect(getAuthMode("nonsense")).toBe("cloudflare_access");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/auth-mode.test.ts`
Expected: FAIL — `getAuthMode("whop")` returns `"cloudflare_access"` (enum catch).

- [ ] **Step 3: Implement**

In `src/lib/auth-mode.ts`, change:

```ts
type AuthMode = "cloudflare_access" | "local_noauth" | "hosted" | "whop";

const authModeSchema = z
  .enum(["cloudflare_access", "local_noauth", "hosted", "whop"])
  .catch("cloudflare_access");
```

and append:

```ts
export function isWhopAuthMode(value: string | null | undefined) {
  return getAuthMode(value) === "whop";
}

export function isWhopClientAuthMode() {
  // Same build-time contract as isHostedClientAuthMode: the operator must set
  // AUTH_MODE=whop in both the client build environment and the runtime.
  return isWhopAuthMode(import.meta.env.AUTH_MODE);
}
```

In `src/env.d.ts`, change both `AUTH_MODE` unions (lines 15 and 51) to:

```ts
AUTH_MODE?: "cloudflare_access" | "local_noauth" | "hosted" | "whop";
```

and add to the `Cloudflare.Env` interface (after `AUTUMN_WEBHOOK_SECRET?`):

```ts
    // Whop OAuth login + product gating (AUTH_MODE=whop).
    WHOP_CLIENT_ID?: string;
    WHOP_CLIENT_SECRET?: string;
    WHOP_API_KEY?: string;
    WHOP_PRODUCT_ID?: string;
    WHOP_CHECKOUT_URL?: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/auth-mode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-mode.ts src/lib/auth-mode.test.ts src/env.d.ts
git commit -m "feat: add whop auth mode"
```

---

### Task 2: Whop as a better-auth genericOAuth provider

**Files:**
- Modify: `src/lib/auth-config.ts`
- Modify: `src/lib/auth.ts`
- Test: `src/lib/auth-whop-config.test.ts` (create)

**Interfaces:**
- Consumes: `isWhopAuthMode` (Task 1); existing `createBaseAuthConfig()` pattern.
- Produces: `getWhopOAuthProviderConfig(envLike): GenericOAuthConfig` returning `{ providerId: "whop", clientId, clientSecret, authorizationUrl, tokenUrl, userInfoUrl, scopes: ["openid", "profile", "email"], pkce: true }`, and `hasWhopAuthConfig(): boolean`. Better-auth provider id is exactly `"whop"` — the client and the account-table lookup in Task 4 depend on it.

Notes for the implementer:
- better-auth's `genericOAuth` plugin accepts explicit `authorizationUrl` / `tokenUrl` / `userInfoUrl` when no `discoveryUrl` is given (same plugin already configured in `createBaseAuthConfig` for Google Search Console).
- The Whop OIDC `sub` claim (`user_xxx`) becomes the better-auth account `providerAccountId`; `email`/`name` map to the user record.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth-whop-config.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { getWhopOAuthProviderConfig } from "./auth-config";

describe("getWhopOAuthProviderConfig", () => {
  it("builds a whop genericOAuth config from env values", () => {
    const config = getWhopOAuthProviderConfig({
      WHOP_CLIENT_ID: "app_123",
      WHOP_CLIENT_SECRET: "secret_456",
    });
    expect(config.providerId).toBe("whop");
    expect(config.clientId).toBe("app_123");
    expect(config.clientSecret).toBe("secret_456");
    expect(config.authorizationUrl).toBe("https://api.whop.com/oauth/authorize");
    expect(config.tokenUrl).toBe("https://api.whop.com/oauth/token");
    expect(config.userInfoUrl).toBe("https://api.whop.com/oauth/userinfo");
    expect(config.scopes).toEqual(["openid", "profile", "email"]);
    expect(config.pkce).toBe(true);
  });

  it("throws when WHOP_CLIENT_ID is missing", () => {
    expect(() =>
      getWhopOAuthProviderConfig({ WHOP_CLIENT_SECRET: "secret_456" }),
    ).toThrow("WHOP_CLIENT_ID is required in whop mode");
  });

  it("throws when WHOP_CLIENT_SECRET is missing", () => {
    expect(() => getWhopOAuthProviderConfig({ WHOP_CLIENT_ID: "app_123" })).toThrow(
      "WHOP_CLIENT_SECRET is required in whop mode",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/auth-whop-config.test.ts`
Expected: FAIL — `getWhopOAuthProviderConfig is not a function` (not exported).

- [ ] **Step 3: Implement**

In `src/lib/auth-config.ts`, add an env-shape type and the builder (top of file, after imports):

```ts
export type WhopEnvLike = {
  WHOP_CLIENT_ID?: string;
  WHOP_CLIENT_SECRET?: string;
};

export function getWhopOAuthProviderConfig(envLike: WhopEnvLike) {
  const clientId = envLike.WHOP_CLIENT_ID?.trim();
  const clientSecret = envLike.WHOP_CLIENT_SECRET?.trim();

  if (!clientId) {
    throw new Error("WHOP_CLIENT_ID is required in whop mode");
  }
  if (!clientSecret) {
    throw new Error("WHOP_CLIENT_SECRET is required in whop mode");
  }

  return {
    providerId: "whop",
    clientId,
    clientSecret,
    authorizationUrl: "https://api.whop.com/oauth/authorize",
    tokenUrl: "https://api.whop.com/oauth/token",
    userInfoUrl: "https://api.whop.com/oauth/userinfo",
    scopes: ["openid", "profile", "email"],
    pkce: true,
  };
}
```

Then in `createBaseAuthConfig()`, extend the existing `genericOAuth({ config: [...] })` array so the whop entry is appended **only when whop env vars are present** (keeps every other mode untouched):

```ts
      genericOAuth({
        config: [
          {
            providerId: GSC_OAUTH_PROVIDER_ID,
            // ... existing GSC entry unchanged ...
          },
          ...(env.WHOP_CLIENT_ID?.trim() && env.WHOP_CLIENT_SECRET?.trim()
            ? [getWhopOAuthProviderConfig(env)]
            : []),
        ],
      }),
```

In `src/lib/auth.ts`, add (next to `hasHostedAuthConfig`):

```ts
export function hasWhopAuthConfig() {
  try {
    getHostedBaseUrl(); // whop mode reuses the hosted base URL requirement
    getHostedSecret();
    getWhopOAuthProviderConfig(env);
    return Boolean(env.WHOP_API_KEY?.trim() && env.WHOP_PRODUCT_ID?.trim());
  } catch {
    return false;
  }
}
```

(import `getWhopOAuthProviderConfig` from `@/lib/auth-config` at the top of `auth.ts`.)

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/auth-whop-config.test.ts && pnpm types:check`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-config.ts src/lib/auth.ts src/lib/auth-whop-config.test.ts
git commit -m "feat: whop genericOAuth provider config"
```

---

### Task 3: Whop access check module (with cache + grace)

**Files:**
- Create: `src/server/lib/whop/access.ts`
- Test: `src/server/lib/whop/access.test.ts`

**Interfaces:**
- Consumes: `getOptionalEnvValue` from `@/server/lib/runtime-env` (reads `WHOP_API_KEY`, `WHOP_PRODUCT_ID`).
- Produces: `checkWhopProductAccess(whopUserId: string): Promise<boolean>` — true when the user has an active membership for `WHOP_PRODUCT_ID`. Caches results for 1 hour; on Whop API/network failure returns the cached value if one exists (any age — grace), otherwise throws. Also exports `_clearWhopAccessCache()` for tests.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/lib/whop/access.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const getOptionalEnvValue = vi.fn(async (name: string) => {
  if (name === "WHOP_API_KEY") return "whop_key_123";
  if (name === "WHOP_PRODUCT_ID") return "prod_123";
  return undefined;
});
vi.mock("@/server/lib/runtime-env", () => ({ getOptionalEnvValue }));

import { _clearWhopAccessCache, checkWhopProductAccess } from "./access";

function accessResponse(hasAccess: boolean) {
  return new Response(
    JSON.stringify({ has_access: hasAccess, access_level: hasAccess ? "customer" : "no_access" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  _clearWhopAccessCache();
  vi.unstubAllGlobals();
});

describe("checkWhopProductAccess", () => {
  it("returns true when Whop reports access, calling the documented endpoint", async () => {
    const fetchMock = vi.fn(async () => accessResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkWhopProductAccess("user_abc")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.whop.com/api/v1/users/user_abc/access/prod_123",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer whop_key_123" }),
      }),
    );
  });

  it("returns false when Whop reports no access", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => accessResponse(false)));
    await expect(checkWhopProductAccess("user_abc")).resolves.toBe(false);
  });

  it("serves the cached result within the TTL without refetching", async () => {
    const fetchMock = vi.fn(async () => accessResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    await checkWhopProductAccess("user_abc");
    await checkWhopProductAccess("user_abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a stale cached value when the Whop API is down (grace)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => accessResponse(true)));
    await checkWhopProductAccess("user_abc");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => { throw new Error("network down"); }),
    );
    await expect(checkWhopProductAccess("user_abc")).resolves.toBe(true);
  });

  it("throws when the API is down and nothing is cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => { throw new Error("network down"); }),
    );
    await expect(checkWhopProductAccess("user_abc")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/lib/whop/access.test.ts`
Expected: FAIL — module `./access` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/server/lib/whop/access.ts
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheEntry = { hasAccess: boolean; checkedAt: number };
const accessCache = new Map<string, CacheEntry>();

export function _clearWhopAccessCache() {
  accessCache.clear();
}

async function fetchWhopAccess(whopUserId: string): Promise<boolean> {
  const apiKey = await getOptionalEnvValue("WHOP_API_KEY");
  const productId = await getOptionalEnvValue("WHOP_PRODUCT_ID");
  if (!apiKey || !productId) {
    throw new Error("WHOP_API_KEY and WHOP_PRODUCT_ID are required in whop mode");
  }

  const response = await fetch(
    `https://api.whop.com/api/v1/users/${whopUserId}/access/${productId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!response.ok) {
    throw new Error(`Whop access check failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { has_access?: boolean };
  return body.has_access === true;
}

export async function checkWhopProductAccess(
  whopUserId: string,
): Promise<boolean> {
  const cached = accessCache.get(whopUserId);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.hasAccess;
  }

  try {
    const hasAccess = await fetchWhopAccess(whopUserId);
    accessCache.set(whopUserId, { hasAccess, checkedAt: Date.now() });
    return hasAccess;
  } catch (error) {
    // Grace: if Whop is unreachable but we have any prior answer, keep it
    // rather than locking users out during a Whop outage.
    if (cached) {
      return cached.hasAccess;
    }
    throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/lib/whop/access.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/whop/access.ts src/server/lib/whop/access.test.ts
git commit -m "feat: whop product access check with cache and outage grace"
```

---

### Task 4: Whop request-context resolution + server gate

**Files:**
- Create: `src/middleware/ensure-user/whop.ts`
- Modify: `src/middleware/ensure-user/resolve.ts`
- Modify: `src/server.ts` (whop branch in `handleFetch`)
- Test: `src/middleware/ensure-user/whop.test.ts`

**Interfaces:**
- Consumes: `checkWhopProductAccess` (Task 3); `getAuth().api.getSession({ headers })`; `getOrCreateDefaultHostedOrganization` from `@/server/auth/default-hosted-organization`; `EnsuredUserContext` from `./types` (read `src/middleware/ensure-user/types.ts` and `hosted.ts` first — `whop.ts` mirrors `hosted.ts`'s session→org resolution, minus hosted-only config checks, plus the access check).
- Produces: `resolveWhopContext(headers: Headers): Promise<EnsuredUserContext>` — throws `AppError("WHOP_ACCESS_DENIED", ...)` when the user has no membership; throws the existing unauthenticated error when there is no session. Consumed by `resolve.ts` (server functions) and `src/server.ts` (`/agents/*` routes).

The Whop user id is read from the better-auth `account` table: row where `userId = session.user.id` and `providerId = "whop"`; its `accountId` column holds the OIDC `sub` (`user_xxx`). Use the same drizzle `db` + provider pattern as `src/server/auth/default-hosted-organization.ts` (read that file before writing the query).

- [ ] **Step 1: Write the failing test**

```ts
// src/middleware/ensure-user/whop.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession } }),
}));

const accountRows: Array<{ accountId: string }> = [];
vi.mock("@/db", () => ({
  db: {
    query: {
      account: {
        findFirst: vi.fn(async () => accountRows[0] ?? undefined),
      },
    },
  },
}));

vi.mock("@/server/auth/default-hosted-organization", () => ({
  getOrCreateDefaultHostedOrganization: vi.fn(async () => "org_123"),
}));

const checkWhopProductAccess = vi.fn(async () => true);
vi.mock("@/server/lib/whop/access", () => ({ checkWhopProductAccess }));

import { resolveWhopContext } from "./whop";

beforeEach(() => {
  getSession.mockReset();
  checkWhopProductAccess.mockReset();
  accountRows.length = 0;
});

describe("resolveWhopContext", () => {
  it("returns the ensured context when the user has product access", async () => {
    getSession.mockResolvedValue({
      user: { id: "u1", email: "buyer@example.com", name: "Buyer" },
    });
    accountRows.push({ accountId: "user_whop1" });
    checkWhopProductAccess.mockResolvedValue(true);

    const context = await resolveWhopContext(new Headers());
    expect(context.userId).toBe("u1");
    expect(context.organizationId).toBe("org_123");
    expect(checkWhopProductAccess).toHaveBeenCalledWith("user_whop1");
  });

  it("throws when there is no session", async () => {
    getSession.mockResolvedValue(null);
    await expect(resolveWhopContext(new Headers())).rejects.toThrow();
  });

  it("throws WHOP_ACCESS_DENIED when the membership check fails", async () => {
    getSession.mockResolvedValue({
      user: { id: "u1", email: "buyer@example.com", name: "Buyer" },
    });
    accountRows.push({ accountId: "user_whop1" });
    checkWhopProductAccess.mockResolvedValue(false);

    await expect(resolveWhopContext(new Headers())).rejects.toThrow(
      /WHOP_ACCESS_DENIED/,
    );
  });
});
```

(Adjust the `db.query.account.findFirst` mock shape to match how `default-hosted-organization.ts` actually queries drizzle — the implementer reads that file first and aligns both mock and query with it. The assertions above are the contract.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/middleware/ensure-user/whop.test.ts`
Expected: FAIL — `./whop` does not exist.

- [ ] **Step 3: Implement**

Read `src/middleware/ensure-user/hosted.ts`, `src/middleware/ensure-user/types.ts`, and `src/server/auth/default-hosted-organization.ts` first. Create `src/middleware/ensure-user/whop.ts` mirroring `hosted.ts`'s session→org flow with these differences:

1. Config validation calls `hasWhopAuthConfig()` (Task 2) and throws `AppError("AUTH_CONFIG_MISSING", "Missing Whop auth configuration")` when false.
2. After resolving the session user, look up the whop account id:

```ts
const whopAccount = await db.query.account.findFirst({
  where: (account, { and, eq }) =>
    and(eq(account.userId, user.id), eq(account.providerId, "whop")),
});
if (!whopAccount) {
  throw new AppError("WHOP_ACCESS_DENIED", "No linked Whop account");
}
```

3. Gate on membership:

```ts
const hasAccess = await checkWhopProductAccess(whopAccount.accountId);
if (!hasAccess) {
  throw new AppError("WHOP_ACCESS_DENIED", "No active OneTime SEO membership");
}
```

4. Return the same `EnsuredUserContext` shape `hosted.ts` returns (user id/email + `organizationId` from `getOrCreateDefaultHostedOrganization`).

In `src/middleware/ensure-user/resolve.ts`, add the branch before the hosted branch:

```ts
import { getAuthMode, isHostedAuthMode, isWhopAuthMode } from "@/lib/auth-mode";
import { resolveWhopContext } from "./whop";
// ...
  if (isWhopAuthMode(authMode)) {
    return resolveWhopContext(headers);
  }
```

In `src/server.ts` `handleFetch`, add a whop branch alongside the hosted branch (read the current function first; the hosted branch wraps requests in `openSeoOAuthProvider.fetch`). For whop mode, requests should flow through the same OAuth-provider wrapper only if it is mode-agnostic; otherwise route straight to `appFetch(request)` while keeping the `/agents/*` routing. The safe minimal change:

```ts
if (isWhopAuthMode(authMode)) {
  if (pathname.startsWith("/agents/")) {
    return routeChatAgents(publicRequest, env);
  }
  return appFetch(request);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/middleware/ensure-user/whop.test.ts && pnpm vitest run src/middleware && pnpm types:check`
Expected: PASS; existing middleware tests stay green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/ensure-user/whop.ts src/middleware/ensure-user/whop.test.ts src/middleware/ensure-user/resolve.ts src/server.ts
git commit -m "feat: whop request context gated on product membership"
```

---

### Task 5: Client gate — access status server function + checkout redirect

**Files:**
- Create: `src/serverFunctions/whop.ts`
- Create: `src/client/features/auth/useWhopAccessGuard.ts`
- Modify: `src/routes/_app/route.tsx` (read first; the `_app` layout is where authenticated app chrome lives — add the guard hook there)
- Modify: `src/routes/_auth.sign-in.tsx` (Task 6 does the button; here only the `error=no_access` notice)
- Test: `src/serverFunctions/whop.test.ts`

**Interfaces:**
- Consumes: `resolveWhopContext` behavior via `requireAuthenticatedContext` middleware (Task 4); `isWhopClientAuthMode` (Task 1).
- Produces:
  - `getWhopAccessStatus` server fn (GET, `requireAuthenticatedContext`) → `{ hasAccess: boolean, checkoutUrl: string | null }`. Implementation: call `checkWhopProductAccess` with the caller's whop account id; because `requireAuthenticatedContext` already ran `resolveWhopContext`, a `WHOP_ACCESS_DENIED` error from the middleware itself signals `hasAccess: false` — so this function must instead use a **non-throwing** variant: export `tryResolveWhopContext(headers)` from `src/middleware/ensure-user/whop.ts` (add it there: same as `resolveWhopContext` but returns `{ hasAccess: false, checkoutUrl }` instead of throwing on membership failure; unauthenticated still throws). Register `getWhopAccessStatus` WITHOUT the ensure-user middleware, using `createServerFn({ method: "GET" }).handler(({ request }) => tryResolveWhopContext(request.headers))`.
  - `useWhopAccessGuard()` hook: in whop client mode, queries `getWhopAccessStatus`; when `hasAccess === false`, redirects the browser to `checkoutUrl` (from `WHOP_CHECKOUT_URL` server env, returned by the server fn — never hardcode it client-side).

- [ ] **Step 1: Write the failing test**

```ts
// src/serverFunctions/whop.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: { WHOP_CHECKOUT_URL: "https://whop.com/checkout/plan_123" },
}));

const tryResolveWhopContext = vi.fn();
vi.mock("@/middleware/ensure-user/whop", () => ({ tryResolveWhopContext }));

import { getWhopAccessStatus } from "./whop";

beforeEach(() => tryResolveWhopContext.mockReset());

describe("getWhopAccessStatus", () => {
  it("returns hasAccess true with no checkout url for members", async () => {
    tryResolveWhopContext.mockResolvedValue({ hasAccess: true });
    await expect(
      getWhopAccessStatus({ request: new Request("http://x/") } as never),
    ).resolves.toEqual({ hasAccess: true, checkoutUrl: null });
  });

  it("returns the checkout url for non-members", async () => {
    tryResolveWhopContext.mockResolvedValue({ hasAccess: false });
    await expect(
      getWhopAccessStatus({ request: new Request("http://x/") } as never),
    ).resolves.toEqual({
      hasAccess: false,
      checkoutUrl: "https://whop.com/checkout/plan_123",
    });
  });
});
```

(The exact call signature of a TanStack server fn in tests may differ — align with how existing server functions are unit-tested in this repo if any are; otherwise test the exported handler body. The contract above is what must hold.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/serverFunctions/whop.test.ts`
Expected: FAIL — `./whop` does not exist (and `tryResolveWhopContext` not yet exported).

- [ ] **Step 3: Implement**

Add to `src/middleware/ensure-user/whop.ts`:

```ts
export async function tryResolveWhopContext(
  headers: Headers,
): Promise<{ hasAccess: boolean } & Partial<EnsuredUserContext>> {
  try {
    const context = await resolveWhopContext(headers);
    return { hasAccess: true, ...context };
  } catch (error) {
    if (error instanceof AppError && error.code === "WHOP_ACCESS_DENIED") {
      return { hasAccess: false };
    }
    throw error;
  }
}
```

(Match the real `AppError` shape in this codebase — check how `hosted.ts` constructs/imports it and mirror that.)

Create `src/serverFunctions/whop.ts`:

```ts
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { tryResolveWhopContext } from "@/middleware/ensure-user/whop";

export const getWhopAccessStatus = createServerFn({ method: "GET" }).handler(
  async ({ request }) => {
    const { hasAccess } = await tryResolveWhopContext(request.headers);
    return {
      hasAccess,
      checkoutUrl: hasAccess ? null : (env.WHOP_CHECKOUT_URL?.trim() || null),
    };
  },
);
```

Create `src/client/features/auth/useWhopAccessGuard.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { isWhopClientAuthMode } from "@/lib/auth-mode";
import { getWhopAccessStatus } from "@/serverFunctions/whop";

export function useWhopAccessGuard() {
  const isWhopMode = isWhopClientAuthMode();
  const statusQuery = useQuery({
    queryKey: ["whop-access-status"],
    queryFn: () => getWhopAccessStatus(),
    enabled: isWhopMode,
    refetchInterval: 60 * 60 * 1000, // match the server cache TTL
    retry: false,
  });

  const checkoutUrl = statusQuery.data?.checkoutUrl;
  useEffect(() => {
    if (checkoutUrl) {
      window.location.assign(checkoutUrl);
    }
  }, [checkoutUrl]);

  return {
    isWhopMode,
    canRenderApp: !isWhopMode || statusQuery.data?.hasAccess === true,
  };
}
```

In `src/routes/_app/route.tsx`, call the hook in the layout component and render `null` while `!canRenderApp` (mirror how `_authenticated.tsx` uses `useHostedAuthRouteGuard`).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/serverFunctions/whop.test.ts && pnpm types:check`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/serverFunctions/whop.ts src/serverFunctions/whop.test.ts src/client/features/auth/useWhopAccessGuard.ts src/routes/_app/route.tsx src/middleware/ensure-user/whop.ts
git commit -m "feat: client whop access guard with checkout redirect"
```

---

### Task 6: "Sign in with Whop" UI

**Files:**
- Modify: `src/routes/_auth.sign-in.tsx`
- Modify: `src/client/features/auth/AuthPage.tsx` (add a `WhopLogo` inline SVG next to the existing `GoogleLogo`, and a whop branch in `AuthMethodChooser`)
- Modify: `src/client/features/auth/useHostedAuthRouteGuard.ts`
- Modify: `src/client/components/AuthConfigErrorCard.tsx`

**Interfaces:**
- Consumes: `isWhopClientAuthMode` (Task 1); better-auth client `signIn.oauth2({ providerId: "whop", callbackURL })` (genericOAuth client API — verify the exact client method name against the installed better-auth version's docs/`auth-client.ts` exports before writing the handler; it is `signIn.oauth2` in current versions).
- Produces: whop-mode sign-in page with a single "Sign in with Whop" button; route guard treats whop mode like hosted (session required, but no email verification requirement — Whop OAuth emails are already verified).

- [ ] **Step 1: Extend the route guard**

In `useHostedAuthRouteGuard.ts`, treat whop as an authenticated mode: compute `const isWhopMode = isWhopClientAuthMode();` and `const isGatedMode = isHostedMode || isWhopMode;` — use `isGatedMode` where `isHostedMode` currently gates the redirect logic, and skip the email-verification branch when `isWhopMode`. Also update `_auth.tsx` similarly (`isHostedMode && (isPending || session)` → include whop) so the signed-in bounce works.

- [ ] **Step 2: Sign-in button**

In `_auth.sign-in.tsx`, when `isWhopClientAuthMode()` is true, render ONLY the whop button (hide email/password form, Google button, and sign-up link). Handler, modeled on the existing `handleContinueWithGoogle`:

```ts
async function handleContinueWithWhop() {
  setSocialError(null);
  setIsStartingWhop(true);
  try {
    const result = await authClient.signIn.oauth2({
      providerId: "whop",
      callbackURL: authCallbackURL,
    });
    if (result.error) {
      setSocialError(
        result.error.message || "Whop sign in is not available right now.",
      );
      setIsStartingWhop(false);
    }
  } catch {
    setSocialError("Whop sign in is not available right now.");
    setIsStartingWhop(false);
  }
}
```

Button markup: copy the Google button's classes from `AuthPage.tsx`; label "Sign in with Whop"; add a `WhopLogo` inline SVG (simple wordmark "whop" in the brand purple `#8B5CF6`-adjacent tone already used by Whop, or a neutral glyph — match the existing GoogleLogo sizing, `className="size-5"`).

- [ ] **Step 3: Config error card copy**

In `AuthConfigErrorCard.tsx`, extend the static help paragraph with: whop mode requires `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WHOP_CLIENT_ID`, `WHOP_CLIENT_SECRET`, `WHOP_API_KEY`, `WHOP_PRODUCT_ID`.

- [ ] **Step 4: Verify build + existing tests**

Run: `pnpm types:check && pnpm vitest run src/lib src/client`
Expected: clean. (Sign-in flow itself is verified manually in Task 12 — no existing e2e covers social login.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/_auth.sign-in.tsx src/client/features/auth/AuthPage.tsx src/client/features/auth/useHostedAuthRouteGuard.ts src/routes/_auth.tsx src/client/components/AuthConfigErrorCard.tsx
git commit -m "feat: sign in with Whop UI for whop auth mode"
```

---

### Task 7: Per-organization DataForSEO key — schema + migration

**Files:**
- Modify: `src/db/better-auth-schema.ts` (`organization` table, lines 111-122)
- Modify: `src/db/pg/better-auth-schema.ts` (pg `organization` table)
- Generate: `drizzle/` and `drizzle-pg/` new migration files
- Test: existing `src/db/schema-parity.test.ts` covers the dual-schema rule

**Interfaces:**
- Produces: `organization.dataforseoApiKey` column (`text`, nullable) in both dialects. Task 8 encrypts values before writing; the column stores ciphertext, never plaintext.

- [ ] **Step 1: Add the column (sqlite)**

In `src/db/better-auth-schema.ts` `organization` table, after `metadata`:

```ts
    // Encrypted per-organization DataForSEO key (whop BYOK mode). Ciphertext
    // written by src/server/lib/dataforseo/org-key.ts; null = fall back to the
    // instance-wide DATAFORSEO_API_KEY env var.
    dataforseoApiKey: text("dataforseo_api_key"),
```

- [ ] **Step 2: Add the column (pg)**

Mirror in `src/db/pg/better-auth-schema.ts`:

```ts
    dataforseoApiKey: text("dataforseo_api_key"),
```

- [ ] **Step 3: Generate migrations + run parity test**

Run: `pnpm db:generate:d1 && pnpm db:generate:pg && pnpm vitest run src/db/schema-parity.test.ts`
Expected: two new migration files (one per dialect) adding `dataforseo_api_key` to `organization`; parity test PASS.

- [ ] **Step 4: Commit**

```bash
git add src/db/better-auth-schema.ts src/db/pg/better-auth-schema.ts drizzle drizzle-pg
git commit -m "feat: per-organization dataforseo key column"
```

---

### Task 8: Encrypted org key storage service

**Files:**
- Create: `src/server/lib/dataforseo/org-key.ts`
- Test: `src/server/lib/dataforseo/org-key.test.ts`

**Interfaces:**
- Consumes: `symmetricEncrypt`/`symmetricDecrypt` from `better-auth/crypto` (same primitives used for OAuth token encryption; key material derives from `BETTER_AUTH_SECRET`); drizzle `db` from `@/db`; `organization` table (Task 7).
- Produces:
  - `setOrgDataforseoKey(organizationId: string, plaintextKey: string): Promise<void>` — encrypts and stores; empty string clears (sets null).
  - `getOrgDataforseoKey(organizationId: string): Promise<string | null>` — returns decrypted plaintext or null.
  - Both take an injectable secret: `setOrgDataforseoKey(organizationId, plaintextKey, secret = getHostedSecretValue())` pattern is NOT used — instead the module reads `BETTER_AUTH_SECRET` via `getRequiredEnvValue` at call time (consistent with repo style) and the tests mock `@/server/lib/runtime-env`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/lib/dataforseo/org-key.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-secret-key-with-32-characters!!"),
  getOptionalEnvValue: vi.fn(async () => undefined),
}));

const stored = new Map<string, string | null>();
vi.mock("@/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: (values: { dataforseoApiKey: string | null }) => ({
        where: vi.fn(async () => {
          stored.set("org_1", values.dataforseoApiKey);
        }),
      }),
    })),
    query: {
      organization: {
        findFirst: vi.fn(async () => ({
          dataforseoApiKey: stored.get("org_1") ?? null,
        })),
      },
    },
  },
}));

import { getOrgDataforseoKey, setOrgDataforseoKey } from "./org-key";

beforeEach(() => stored.clear());

describe("org dataforseo key", () => {
  it("round-trips a key through encryption at rest", async () => {
    await setOrgDataforseoKey("org_1", "b64loginpassword");
    expect(stored.get("org_1")).not.toBe("b64loginpassword"); // ciphertext
    expect(stored.get("org_1")).toBeTruthy();
    await expect(getOrgDataforseoKey("org_1")).resolves.toBe("b64loginpassword");
  });

  it("returns null when no key is stored", async () => {
    await expect(getOrgDataforseoKey("org_1")).resolves.toBeNull();
  });

  it("clears the key on empty input", async () => {
    await setOrgDataforseoKey("org_1", "b64loginpassword");
    await setOrgDataforseoKey("org_1", "");
    await expect(getOrgDataforseoKey("org_1")).resolves.toBeNull();
  });
});
```

(The drizzle mock chain above must be aligned by the implementer with the real query style used in `default-hosted-organization.ts`; the round-trip assertions are the contract. `symmetricEncrypt`/`symmetricDecrypt` round-trip with the same secret, so the test exercises real crypto.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/lib/dataforseo/org-key.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/server/lib/dataforseo/org-key.ts
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organization } from "@/db/better-auth-schema";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

async function getKeySecret(): Promise<string> {
  return getRequiredEnvValue("BETTER_AUTH_SECRET");
}

export async function setOrgDataforseoKey(
  organizationId: string,
  plaintextKey: string,
): Promise<void> {
  const trimmed = plaintextKey.trim();
  const value = trimmed
    ? await symmetricEncrypt({ key: await getKeySecret(), data: trimmed })
    : null;
  await db
    .update(organization)
    .set({ dataforseoApiKey: value })
    .where(eq(organization.id, organizationId));
}

export async function getOrgDataforseoKey(
  organizationId: string,
): Promise<string | null> {
  const row = await db.query.organization.findFirst({
    where: (org, { eq: eqOp }) => eqOp(org.id, organizationId),
  });
  if (!row?.dataforseoApiKey) {
    return null;
  }
  return symmetricDecrypt({
    key: await getKeySecret(),
    data: row.dataforseoApiKey,
  });
}
```

(If the pg/d1 schema import differs — `db` from `@/db` is provider-aware; match how `default-hosted-organization.ts` imports the organization table and use the same source. Verify `symmetricEncrypt` accepts `{ key, data }` against the installed better-auth version — `src/server/features/gsc/selfHostedOAuth.ts` uses exactly this call shape.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/lib/dataforseo/org-key.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/dataforseo/org-key.ts src/server/lib/dataforseo/org-key.test.ts
git commit -m "feat: encrypted per-org dataforseo key storage"
```

---

### Task 9: Thread the per-org key into DataForSEO requests

**Files:**
- Modify: `src/server/lib/dataforseo/core.ts` (lines ~60-136: `createAuthenticatedFetch`, `http`, section factories)
- Modify: `src/server/lib/dataforseo/client.ts` (`createDataforseoClient`, line 63)
- Modify: the section factory call sites inside `client.ts` (and only there — the lazy `loadDataforseoSections()` boundary stays)
- Modify: `src/serverFunctions/config.ts` (`getSeoApiKeyStatus`)
- Test: `src/server/lib/dataforseo/core-key-resolution.test.ts` (create)

**Interfaces:**
- Consumes: `getOrgDataforseoKey` (Task 8); `BillingCustomerContext` (`organizationId`) in `createDataforseoClient`.
- Produces:
  - `resolveDataforseoApiKey(organizationId: string): Promise<string>` — org key → `DATAFORSEO_API_KEY` env fallback → throw `AppError("DATAFORSEO_KEY_MISSING", "Add your DataForSEO API key in Settings")`.
  - `createAuthenticatedFetch(classify?, apiKeyOverride?: string)` and `http(classify?, apiKeyOverride?)` — when the override is provided it is used; otherwise the env var (preserves self-host behavior).
  - `getSeoApiKeyStatus` now returns `{ configured: boolean }` where configured = org key present OR env var present (uses the caller's org from `requireAuthenticatedContext`).

- [ ] **Step 1: Write the failing test**

```ts
// src/server/lib/dataforseo/core-key-resolution.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const getOrgDataforseoKey = vi.fn(async () => null as string | null);
vi.mock("@/server/lib/dataforseo/org-key", () => ({ getOrgDataforseoKey }));

const getRequiredEnvValue = vi.fn(async () => "env-key");
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue,
  getOptionalEnvValue: vi.fn(async () => "env-key"),
}));

import { resolveDataforseoApiKey } from "./core";

beforeEach(() => {
  getOrgDataforseoKey.mockReset();
  getOrgDataforseoKey.mockResolvedValue(null);
  getRequiredEnvValue.mockClear();
});

describe("resolveDataforseoApiKey", () => {
  it("prefers the org key over the env var", async () => {
    getOrgDataforseoKey.mockResolvedValue("org-key");
    await expect(resolveDataforseoApiKey("org_1")).resolves.toBe("org-key");
  });

  it("falls back to the env var when no org key is stored", async () => {
    await expect(resolveDataforseoApiKey("org_1")).resolves.toBe("env-key");
  });

  it("throws DATAFORSEO_KEY_MISSING when neither exists", async () => {
    getRequiredEnvValue.mockRejectedValue(
      new Error("Missing required environment variable: DATAFORSEO_API_KEY"),
    );
    await expect(resolveDataforseoApiKey("org_1")).rejects.toThrow(
      /DATAFORSEO_KEY_MISSING/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/lib/dataforseo/core-key-resolution.test.ts`
Expected: FAIL — `resolveDataforseoApiKey` not exported.

- [ ] **Step 3: Implement**

Read `src/server/lib/dataforseo/core.ts` and `client.ts` fully first. In `core.ts`:

1. Add (importing `getOrgDataforseoKey` from `./org-key`):

```ts
export async function resolveDataforseoApiKey(
  organizationId: string,
): Promise<string> {
  const orgKey = await getOrgDataforseoKey(organizationId);
  if (orgKey) {
    return orgKey;
  }
  try {
    return await getRequiredEnvValue("DATAFORSEO_API_KEY");
  } catch {
    throw new AppError(
      "DATAFORSEO_KEY_MISSING",
      "Add your DataForSEO API key in Settings",
    );
  }
}
```

(import `AppError` from wherever `hosted.ts`/`error-messages.ts` source it — check `src/server` error module first.)

2. Change `createAuthenticatedFetch` to accept the override:

```ts
function createAuthenticatedFetch(
  classify?: DataforseoErrorClassifier,
  apiKeyOverride?: string,
) {
  return async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const apiKey = apiKeyOverride ?? (await getRequiredEnvValue("DATAFORSEO_API_KEY"));
    // ... rest unchanged ...
```

and `http(classify?, apiKeyOverride?)` passing it through. Section factories (`labsApi`, `serpApi`, etc.) gain an optional `apiKey?: string` param forwarded to `http()`.

3. In `client.ts` `createDataforseoClient(customer)`, resolve once and pass down:

```ts
const apiKey = await resolveDataforseoApiKey(customer.organizationId);
```

then pass `apiKey` to every section factory call inside that client. If `createDataforseoClient` is currently synchronous, make it async and update its call sites (`src/server/workflows/RankCheckWorkflow.ts:280`, `src/server/mcp/tools/dataforseo-research-tools.ts`) with `await` — grep for `createDataforseoClient(` to catch all callers.

4. In `src/serverFunctions/config.ts`:

```ts
export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const orgKey = await getOrgDataforseoKey(context.organizationId);
    const configured = Boolean(orgKey || env.DATAFORSEO_API_KEY?.trim());
    return { configured };
  });
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/server/lib/dataforseo && pnpm types:check`
Expected: all dataforseo tests PASS (existing ones use the env mock and keep working since the override is optional); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/dataforseo src/serverFunctions/config.ts src/server/workflows/RankCheckWorkflow.ts src/server/mcp/tools/dataforseo-research-tools.ts
git commit -m "feat: resolve dataforseo key per organization with env fallback"
```

---

### Task 10: Settings UI for the DataForSEO key

**Files:**
- Create: `src/serverFunctions/org-dataforseo-key.ts`
- Modify: `src/routes/_app/settings.tsx`
- Test: `src/serverFunctions/org-dataforseo-key.test.ts`

**Interfaces:**
- Consumes: `setOrgDataforseoKey` / `getOrgDataforseoKey` (Task 8); `requireAuthenticatedContext` from `@/serverFunctions/middleware` (gives `context.organizationId`).
- Produces:
  - `getOrgDataforseoKeyStatus` (GET) → `{ configured: boolean }` (never returns the key itself).
  - `setOrgDataforseoKeyFn` (POST, zod validator `{ apiKey: z.string().max(200) }`) → `{ configured: boolean }`; empty string clears.
  - Settings page section "SEO data (DataForSEO)" in whop mode: password input + Save/Clear + status line, following the file's existing section markup (`<section className="space-y-3">`, `<h2 className="text-sm font-medium text-base-content/50">`, daisyUI inputs, `toast` feedback, React Query mutation like `ProjectSettings.tsx`).

- [ ] **Step 1: Write the failing test**

```ts
// src/serverFunctions/org-dataforseo-key.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const setOrgDataforseoKey = vi.fn(async () => {});
const getOrgDataforseoKey = vi.fn(async () => null as string | null);
vi.mock("@/server/lib/dataforseo/org-key", () => ({
  setOrgDataforseoKey,
  getOrgDataforseoKey,
}));

import { saveOrgDataforseoKey } from "./org-dataforseo-key";

beforeEach(() => {
  setOrgDataforseoKey.mockClear();
  getOrgDataforseoKey.mockReset();
  getOrgDataforseoKey.mockResolvedValue(null);
});

describe("saveOrgDataforseoKey", () => {
  it("stores the key for the caller's organization", async () => {
    await saveOrgDataforseoKey("org_1", "  b64key  ");
    expect(setOrgDataforseoKey).toHaveBeenCalledWith("org_1", "b64key");
  });

  it("reports configured=true after storing", async () => {
    getOrgDataforseoKey.mockResolvedValue("b64key");
    await expect(saveOrgDataforseoKey("org_1", "b64key")).resolves.toEqual({
      configured: true,
    });
  });
});
```

(Export a plain `saveOrgDataforseoKey(organizationId, apiKey)` helper from the module and have the server-fn handler delegate to it — that keeps the test free of server-fn plumbing, matching how other modules here separate concerns.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/serverFunctions/org-dataforseo-key.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/serverFunctions/org-dataforseo-key.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOrgDataforseoKey,
  setOrgDataforseoKey,
} from "@/server/lib/dataforseo/org-key";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export async function saveOrgDataforseoKey(
  organizationId: string,
  apiKey: string,
): Promise<{ configured: boolean }> {
  await setOrgDataforseoKey(organizationId, apiKey.trim());
  const stored = await getOrgDataforseoKey(organizationId);
  return { configured: Boolean(stored) };
}

export const getOrgDataforseoKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    configured: Boolean(await getOrgDataforseoKey(context.organizationId)),
  }));

const setKeySchema = z.object({ apiKey: z.string().max(200) });

export const setOrgDataforseoKeyFn = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setKeySchema)
  .handler(async ({ data, context }) =>
    saveOrgDataforseoKey(context.organizationId, data.apiKey),
  );
```

In `src/routes/_app/settings.tsx`, add the section (rendered when `isWhopClientAuthMode()`), following the Analytics section's markup + `ProjectSettings.tsx`'s mutation pattern: a `password` input, "Save key" primary button, "Remove key" ghost button (saves `""`), status line reading "Key saved" / "No key saved — add one to run SEO queries", plus a short explainer: "OneTime SEO uses your own DataForSEO account for SEO data. Create a key at dataforseo.io, then paste the base64 login:password value here." with a link to the existing help route `/help/dataforseo-api-key`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/serverFunctions/org-dataforseo-key.test.ts && pnpm types:check`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/serverFunctions/org-dataforseo-key.ts src/serverFunctions/org-dataforseo-key.test.ts src/routes/_app/settings.tsx
git commit -m "feat: settings UI for per-org dataforseo key"
```

---

### Task 11: Rebrand to OneTime SEO

**Files:** (known spots from exploration + a final sweep)
- Modify: `src/client/features/auth/AuthPage.tsx` (logo `alt`, headings)
- Modify: `src/routes/_authenticated.subscribe.tsx` (not user-visible in whop mode, but copy should not contradict)
- Modify: `src/client/components/AuthConfigErrorCard.tsx` (README link constant)
- Modify: support email constant (`SUPPORT_EMAIL = "ben@openseo.so"` — grep for it) → `support@onetimesuite.com`
- Modify: pricing URL references (`https://openseo.so/pricing` — grep) → `WHOP_CHECKOUT_URL`-driven or `https://onetimesuite.com`
- Modify: `Dockerfile.selfhost` CMD banner (remove the telemetry-heartbeat echo)
- Modify: `package.json` `name` → `"onetime-seo"`
- Modify: `README.md` — prepend OneTime SEO header block (name, OneTimeSuite.com, $199 on Whop link placeholder `WHOP_CHECKOUT_URL`), keep original OpenSEO attribution section
- Modify: `public/transparent-logo.png` and any favicon/logo assets — replace with OneTime SEO wordmark asset (generate a simple SVG/PNG wordmark; if design assets aren't available, use a text wordmark "OneTime SEO" in the existing logo slot)
- Modify: `index.html` / root route title + meta (`src/routes/__root.tsx`) — title "OneTime SEO", description mentions OneTimeSuite

**Interfaces:**
- No code interfaces. Copy rules: "OneTime SEO", "part of OneTimeSuite.com", "$199 once", never "OpenSEO"/"openseo.so"/"$10/month" in user-visible surfaces.

- [ ] **Step 1: Sweep for brand references**

Run: `grep -rni "openseo\|open-seo\|open seo" src public index.html package.json Dockerfile.selfhost README.md compose.yaml --exclude-dir=node_modules | grep -vi "telemetry\|OPENSEO_TELEMETRY_DISABLED" | head -80`
Review each hit; classify user-visible (change) vs internal identifiers/env names (leave — e.g. `OPENSEO_TELEMETRY_DISABLED`, `openSeoOAuthProvider` internals may keep names to minimize diff, but user-visible strings must change).

- [ ] **Step 2: Apply the copy changes**

Change all user-visible hits per the copy rules above. Discord/X community links in README/help → `https://onetimesuite.com`.

- [ ] **Step 3: Replace the logo asset**

Create `public/onetime-seo-logo.svg` (text wordmark) and update references (`AuthPage.tsx`, `__root.tsx`, subscribe page). Remove or leave unused `transparent-logo.png` (leave the file; just stop referencing it).

- [ ] **Step 4: Verify**

Run: `pnpm types:check && pnpm vitest run src/client`
Expected: clean. Then `grep -rni "openseo\.so\|\$10/month" src public index.html` returns nothing user-visible.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rebrand to OneTime SEO (OneTimeSuite.com)"
```

---

### Task 12: Compose/Coolify runtime config for whop mode

**Files:**
- Create: `compose.onetime-seo.yaml` (deployment compose for Coolify)
- Modify: `Dockerfile.selfhost` (banner already handled in Task 11; verify `AUTH_MODE` flows through)

**Interfaces:**
- Consumes: all env vars from Tasks 1-10.

- [ ] **Step 1: Write the compose file**

```yaml
# Coolify deployment for OneTime SEO (hosted, Whop-gated).
services:
  onetime-seo:
    build:
      context: .
      dockerfile: Dockerfile.selfhost
    restart: unless-stopped
    environment:
      - CLOUDFLARE_INCLUDE_PROCESS_ENV=true
      - PORT=${PORT:-3001}
      - ALLOWED_HOST=${ALLOWED_HOST:-seo.onetimesuite.com}
      - AUTH_MODE=whop
      - BETTER_AUTH_URL=https://seo.onetimesuite.com
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - WHOP_CLIENT_ID=${WHOP_CLIENT_ID}
      - WHOP_CLIENT_SECRET=${WHOP_CLIENT_SECRET}
      - WHOP_API_KEY=${WHOP_API_KEY}
      - WHOP_PRODUCT_ID=${WHOP_PRODUCT_ID}
      - WHOP_CHECKOUT_URL=${WHOP_CHECKOUT_URL}
      # Optional instance-wide fallback key (buyers normally set their own in Settings):
      - DATAFORSEO_API_KEY=${DATAFORSEO_API_KEY:-}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
      - OPENSEO_TELEMETRY_DISABLED=1
    volumes:
      - onetime_seo_data:/app/.wrangler
volumes:
  onetime_seo_data:
```

(Coolify terminates TLS and maps the port; no `ports:` entry needed there, but harmless to add `127.0.0.1:${PORT:-3001}:${PORT:-3001}` for manual runs.)

- [ ] **Step 2: Sanity-check the build locally (if Docker available)**

Run: `docker build -f Dockerfile.selfhost -t onetime-seo .` (skip with a note if Docker isn't on this machine — Coolify builds it anyway.)

- [ ] **Step 3: Commit**

```bash
git add compose.onetime-seo.yaml Dockerfile.selfhost
git commit -m "feat: coolify compose for whop-gated deployment"
```

---

### Task 13: Whop product + OAuth app via Composio

**Files:** none in-repo (ops task; capture outputs into the deploy note, Task 14).

- [ ] **Step 1: Check Composio availability**

Run: `printenv COMPOSIO_API_KEY; npx --yes composio --version 2>&1 | head -2`
If no key/CLI: STOP and ask the user for their Composio API key and confirm their Whop account is connected in Composio. Do not proceed silently.

- [ ] **Step 2: Create the $199 product**

Via Composio's Whop toolkit (action for creating a product/plan — inspect available actions first: `npx composio apps actions WHOP` or the SDK equivalent), create:
- Product name: `OneTime SEO`
- Description: `Semrush/Ahrefs-style SEO suite — keyword research, rank tracking, competitor insights, backlinks, site audits, AI visibility. Pay once, use forever. Part of OneTimeSuite.com. Hosted at seo.onetimesuite.com; bring your own DataForSEO key.`
- Price: one-time, `$199.00` USD.
Record `prod_xxx` (WHOP_PRODUCT_ID) and the checkout URL (WHOP_CHECKOUT_URL).

- [ ] **Step 3: Create the OAuth app**

Whop supports creating OAuth apps via API (`apps.create` with the company API key — needs `WHOP_API_KEY` from the Whop developer dashboard; ask the user for it if Composio's connection doesn't expose it):

```bash
curl -s -X POST https://api.whop.com/api/v1/apps \
  -H "Authorization: Bearer $WHOP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"OneTime SEO","redirect_uris":["https://seo.onetimesuite.com/api/auth/callback/whop","http://localhost:3000/api/auth/callback/whop"]}'
```

Record `app_xxx` (WHOP_CLIENT_ID) and `client_secret` (WHOP_CLIENT_SECRET). If this endpoint 404s against the live API, fall back to instructing the user to create the app in the Whop developer dashboard (OAuth section) with the same two redirect URIs.

- [ ] **Step 4: Report**

Output the four values (product id, checkout URL, client id, client secret) for the deploy step. Never commit them.

---

### Task 14: Deploy to Coolify + DNS

**Files:** none in-repo (ops task).

- [ ] **Step 1: Push the repo**

`gh` is not installed on this machine. Either the user pushes `C:/Users/HP/projects/onetime-seo` to `github.com/bensblueprints/onetime-seo`, or provides a GitHub token. STOP and ask if neither is available. (The remote `origin` currently points to `every-app/open-seo` — add the new remote as `origin` after renaming: `git remote set-url origin git@github.com:bensblueprints/onetime-seo.git` only once the repo exists.)

- [ ] **Step 2: Create the Coolify project + app**

Per the user's CLAUDE.md: Coolify at `http://212.28.184.24:8000`, API token `9|leesferry2026`, Dockerfile build-pack, repo `bensblueprints/onetime-seo`, new project named `OneTime SEO`. Use the Coolify API (`/api/v1/projects`, `/api/v1/applications/dockerfile` — verify current endpoint shapes against the instance with `curl -H "Authorization: Bearer 9|leesferry2026" http://212.28.184.24:8000/api/v1/projects`).

- [ ] **Step 3: Set env vars**

All vars from `compose.onetime-seo.yaml` (Task 12) with the real secrets from Task 13, plus a generated `BETTER_AUTH_SECRET` (`openssl rand -base64 32`).

- [ ] **Step 4: DNS**

Cloudflare A-record `seo.onetimesuite.com` → `212.28.184.24`, proxied (per CLAUDE.md pattern). Then set the app domain in Coolify and deploy.

- [ ] **Step 5: Write back to the Obsidian vault**

Per CLAUDE.md, update the vault notes for Coolify + Cloudflare DNS. The vault (`C:\Users\HP\Documents\working`) is NOT present on this machine — record the entries that need writing (project created, domain, deploy date) and hand them to the user.

---

### Task 15: End-to-end verification

- [ ] **Step 1: Full test suite + build**

Run: `pnpm test && pnpm types:check && pnpm build`
Expected: all green.

- [ ] **Step 2: Manual E2E on the deployed app**

1. Open `https://seo.onetimesuite.com` → redirected to sign-in → "Sign in with Whop" shown.
2. Sign in with a Whop account WITHOUT the membership → bounced to the $199 checkout.
3. Purchase with a test account (or grant a test membership in Whop) → sign in → app loads.
4. Settings → save a personal DataForSEO key → run a keyword research query → results load.
5. Sign out → app is unreachable again.

- [ ] **Step 3: Report**

Summarize: deployment URL, Whop product link, what was verified, any follow-ups (e.g. adding the OneTime SEO card to onetimesuite.com).

---

## Self-Review Notes (completed by plan author)

- Spec coverage: §1 rebrand → Task 11; §2 Whop product via Composio → Task 13; §3 OAuth gating + cache/grace → Tasks 1-6; §4 BYOK → Tasks 7-10; §5 deployment → Tasks 12, 14; §6 error handling → Tasks 3 (grace), 4 (denied), 6 (config card), 10 (missing key UX); §7 testing → Tasks 1-10 unit tests + Task 15 E2E.
- Type consistency: provider id `"whop"` used identically in Tasks 2, 4, 6; `resolveDataforseoApiKey(organizationId)` in Tasks 9; `getOrgDataforseoKey`/`setOrgDataforseoKey` in Tasks 8, 9, 10; `tryResolveWhopContext` defined Task 5, consumed by its server fn; `isWhopAuthMode`/`isWhopClientAuthMode` defined Task 1, used throughout.
- Known implementer-reads (files too long to inline, must be read before editing): `src/server/lib/dataforseo/core.ts` + `client.ts` (Task 9), `src/middleware/ensure-user/hosted.ts` + `types.ts` (Task 4), `src/server/auth/default-hosted-organization.ts` (Tasks 4, 8), `src/routes/_app/settings.tsx` (Task 10), `src/server.ts` (Task 4).
