import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { getOptionalEnvValue, defaultEnvImpl } = vi.hoisted(() => {
  const defaultEnvImpl = async (name: string) => {
    if (name === "WHOP_API_KEY") return "whop_key_123";
    if (name === "WHOP_PRODUCT_ID") return "prod_123";
    if (name === "WHOP_COMPANY_ID") return "biz_123";
    if (name === "WHOP_MONTHLY_PLAN_ID") return "plan_monthly123";
    return undefined;
  };
  return {
    defaultEnvImpl,
    getOptionalEnvValue: vi.fn(defaultEnvImpl),
  };
});
vi.mock("@/server/lib/runtime-env", () => ({ getOptionalEnvValue }));

import { _clearWhopAccessCache, checkWhopProductAccess } from "./access";

const MONTHLY_PLAN_ID = "plan_monthly123";
const LIFETIME_PLAN_ID = "plan_EF4Wcn4KXZSAM";
const GRANDFATHERED_PLAN_ID = "plan_LBrhuz3LSe743";

function accessResponse(hasAccess: boolean) {
  return new Response(
    JSON.stringify({ has_access: hasAccess, access_level: hasAccess ? "customer" : "no_access" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function membershipsResponse(planIds: string[]) {
  return new Response(
    JSON.stringify({
      data: planIds.map((id) => ({ plan: { id }, status: "active" })),
      page_info: { has_next_page: false },
      total_count: planIds.length,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

// Routes fetch mocks by URL: the access check stays the primary gate, the
// memberships list only resolves the tier.
function whopFetchMock(options: {
  hasAccess?: boolean;
  planIds?: string[];
  membershipsFails?: boolean;
}) {
  const { hasAccess = true, planIds = [], membershipsFails = false } = options;
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/memberships")) {
      if (membershipsFails) throw new Error("network down");
      return membershipsResponse(planIds);
    }
    return accessResponse(hasAccess);
  });
}

beforeEach(() => {
  _clearWhopAccessCache();
  vi.unstubAllGlobals();
  getOptionalEnvValue.mockReset().mockImplementation(defaultEnvImpl);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkWhopProductAccess", () => {
  it("grants access and calls the documented access endpoint with the API key", async () => {
    const fetchMock = whopFetchMock({ planIds: [LIFETIME_PLAN_ID] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkWhopProductAccess("user_abc");
    expect(result.hasAccess).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.whop.com/api/v1/users/user_abc/access/prod_123",
      expect.anything(),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer whop_key_123");
  });

  it("denies access when Whop reports no access, without resolving a tier", async () => {
    const fetchMock = whopFetchMock({ hasAccess: false });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkWhopProductAccess("user_abc")).resolves.toEqual({
      hasAccess: false,
      tier: null,
      planIds: [],
    });
    // No active membership → the memberships API is never consulted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves tier subscription for the monthly plan, via the memberships list API", async () => {
    const fetchMock = whopFetchMock({ planIds: [MONTHLY_PLAN_ID] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkWhopProductAccess("user_abc");
    expect(result).toEqual({
      hasAccess: true,
      tier: "subscription",
      planIds: [MONTHLY_PLAN_ID],
    });
    const membershipsCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/memberships"),
    );
    expect(membershipsCall?.[0]).toBe(
      "https://api.whop.com/api/v1/memberships?company_id=biz_123&user_ids=user_abc&product_ids=prod_123&statuses=active&first=50",
    );
  });

  it("resolves tier byok for the lifetime plan", async () => {
    vi.stubGlobal("fetch", whopFetchMock({ planIds: [LIFETIME_PLAN_ID] }));
    const result = await checkWhopProductAccess("user_abc");
    expect(result.tier).toBe("byok");
    expect(result.planIds).toEqual([LIFETIME_PLAN_ID]);
  });

  it("resolves tier byok for the grandfathered $199 plan", async () => {
    vi.stubGlobal("fetch", whopFetchMock({ planIds: [GRANDFATHERED_PLAN_ID] }));
    const result = await checkWhopProductAccess("user_abc");
    expect(result.tier).toBe("byok");
  });

  it("prefers subscription when the member holds both monthly and lifetime plans", async () => {
    vi.stubGlobal(
      "fetch",
      whopFetchMock({ planIds: [LIFETIME_PLAN_ID, MONTHLY_PLAN_ID] }),
    );
    const result = await checkWhopProductAccess("user_abc");
    expect(result.tier).toBe("subscription");
  });

  it("serves the cached result within the TTL without refetching", async () => {
    const fetchMock = whopFetchMock({ planIds: [MONTHLY_PLAN_ID] });
    vi.stubGlobal("fetch", fetchMock);

    await checkWhopProductAccess("user_abc");
    const result = await checkWhopProductAccess("user_abc");
    expect(result.tier).toBe("subscription");
    // One access call + one memberships call, then fully cached.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to a stale cached value when the Whop API is down (grace)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", whopFetchMock({ planIds: [MONTHLY_PLAN_ID] }));
    await checkWhopProductAccess("user_abc");

    // Expire the cached entry so the fresh-TTL branch no longer short-circuits.
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    const failingFetch = vi.fn(async () => { throw new Error("network down"); });
    vi.stubGlobal("fetch", failingFetch);
    const result = await checkWhopProductAccess("user_abc");
    expect(result).toEqual({
      hasAccess: true,
      tier: "subscription",
      planIds: [MONTHLY_PLAN_ID],
    });
    expect(failingFetch).toHaveBeenCalledTimes(1);
  });

  it("throws when the API is down and nothing is cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => { throw new Error("network down"); }),
    );
    await expect(checkWhopProductAccess("user_abc")).rejects.toThrow();
  });

  it("keeps the cached tier when only the memberships API is down", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", whopFetchMock({ planIds: [MONTHLY_PLAN_ID] }));
    await checkWhopProductAccess("user_abc");

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    vi.stubGlobal(
      "fetch",
      whopFetchMock({ planIds: [LIFETIME_PLAN_ID], membershipsFails: true }),
    );
    const result = await checkWhopProductAccess("user_abc");
    expect(result.hasAccess).toBe(true);
    expect(result.tier).toBe("subscription");
  });

  it("defaults to byok-with-grace when the memberships API is down and no tier is cached", async () => {
    vi.stubGlobal(
      "fetch",
      whopFetchMock({ membershipsFails: true }),
    );
    // Access is still granted (the access check is the primary gate); the
    // unknown tier degrades to byok rather than locking the member out.
    const result = await checkWhopProductAccess("user_abc");
    expect(result).toEqual({ hasAccess: true, tier: "byok", planIds: [] });
  });

  it("throws a safe error when WHOP_MONTHLY_PLAN_ID is missing", async () => {
    getOptionalEnvValue.mockImplementation(async (name: string) => {
      if (name === "WHOP_MONTHLY_PLAN_ID") return undefined;
      return defaultEnvImpl(name);
    });
    vi.stubGlobal("fetch", whopFetchMock({ planIds: [LIFETIME_PLAN_ID] }));

    await expect(checkWhopProductAccess("user_abc")).rejects.toThrow(
      "WHOP_MONTHLY_PLAN_ID is required to resolve the Whop membership tier",
    );
  });

  it("isolates cache entries per user", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", whopFetchMock({ planIds: [MONTHLY_PLAN_ID] }));
    const first = await checkWhopProductAccess("user_a");
    expect(first.tier).toBe("subscription");

    // A different user must not see user_a's cached tier: it gets its own
    // fetches and its own (byok) tier even within the cache TTL.
    vi.stubGlobal("fetch", whopFetchMock({ planIds: [LIFETIME_PLAN_ID] }));
    const second = await checkWhopProductAccess("user_b");
    expect(second.tier).toBe("byok");

    // And user_a's cache entry is still intact.
    const again = await checkWhopProductAccess("user_a");
    expect(again.tier).toBe("subscription");
  });

  it("passes company_id to the memberships list call", async () => {
    const fetchMock = whopFetchMock({ planIds: [LIFETIME_PLAN_ID] });
    vi.stubGlobal("fetch", fetchMock);

    await checkWhopProductAccess("user_abc");
    const membershipsCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/memberships"),
    );
    expect(membershipsCall).toBeDefined();
    const url = new URL(String(membershipsCall![0]));
    expect(url.searchParams.get("company_id")).toBe("biz_123");
  });
});
