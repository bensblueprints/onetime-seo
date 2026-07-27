import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { getOptionalEnvValue } = vi.hoisted(() => ({
  getOptionalEnvValue: vi.fn(async (name: string) => {
    if (name === "WHOP_API_KEY") return "whop_key_123";
    if (name === "WHOP_PRODUCT_ID") return "prod_123";
    return undefined;
  }),
}));
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
