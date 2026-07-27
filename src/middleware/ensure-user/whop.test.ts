import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const {
  getSession,
  setActiveOrganization,
  createOrganization,
  hasWhopAuthConfig,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  setActiveOrganization: vi.fn(async () => ({})),
  createOrganization: vi.fn(),
  hasWhopAuthConfig: vi.fn(() => true),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: { getSession, setActiveOrganization, createOrganization },
  }),
  hasWhopAuthConfig,
}));

const { findFirstAccount, accountRows } = vi.hoisted(() => {
  const rows: Array<{ accountId: string }> = [];
  return {
    accountRows: rows,
    findFirstAccount: vi.fn(async () => rows[0] ?? undefined),
  };
});
vi.mock("@/db", () => ({
  db: { query: { account: { findFirst: findFirstAccount } } },
}));

const { getOrCreateDefaultHostedOrganization } = vi.hoisted(() => ({
  getOrCreateDefaultHostedOrganization: vi.fn(async () => "org_123"),
}));
vi.mock("@/server/auth/default-hosted-organization", () => ({
  getOrCreateDefaultHostedOrganization,
}));

const { checkWhopProductAccess } = vi.hoisted(() => ({
  checkWhopProductAccess: vi.fn(async () => true),
}));
vi.mock("@/server/lib/whop/access", () => ({ checkWhopProductAccess }));

import { resolveWhopContext, tryResolveWhopContext } from "./whop";

const whopSession = {
  user: {
    id: "u1",
    email: "buyer@example.com",
    name: "Buyer",
    emailVerified: true,
  },
};

beforeEach(() => {
  getSession.mockReset();
  checkWhopProductAccess.mockReset().mockResolvedValue(true);
  hasWhopAuthConfig.mockReset().mockReturnValue(true);
  setActiveOrganization.mockClear();
  getOrCreateDefaultHostedOrganization.mockClear();
  accountRows.length = 0;
});

describe("resolveWhopContext", () => {
  it("returns the ensured context when the user has product access", async () => {
    getSession.mockResolvedValue(whopSession);
    accountRows.push({ accountId: "user_whop1" });

    const context = await resolveWhopContext(new Headers());
    expect(context.userId).toBe("u1");
    expect(context.userEmail).toBe("buyer@example.com");
    expect(context.organizationId).toBe("org_123");
    expect(checkWhopProductAccess).toHaveBeenCalledWith("user_whop1");
  });

  it("throws UNAUTHENTICATED when there is no session", async () => {
    getSession.mockResolvedValue(null);
    await expect(resolveWhopContext(new Headers())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("throws AUTH_CONFIG_MISSING when the whop auth config is missing", async () => {
    hasWhopAuthConfig.mockReturnValue(false);
    await expect(resolveWhopContext(new Headers())).rejects.toMatchObject({
      code: "AUTH_CONFIG_MISSING",
      message: "Missing Whop auth configuration",
    });
  });

  it("throws WHOP_ACCESS_DENIED when no whop account is linked", async () => {
    getSession.mockResolvedValue(whopSession);
    await expect(resolveWhopContext(new Headers())).rejects.toMatchObject({
      code: "WHOP_ACCESS_DENIED",
      message: "No linked Whop account",
    });
  });

  it("throws WHOP_ACCESS_DENIED when the membership check fails", async () => {
    getSession.mockResolvedValue(whopSession);
    accountRows.push({ accountId: "user_whop1" });
    checkWhopProductAccess.mockResolvedValue(false);

    await expect(resolveWhopContext(new Headers())).rejects.toMatchObject({
      code: "WHOP_ACCESS_DENIED",
      message: "No active OneTime SEO membership",
    });
  });
});

describe("tryResolveWhopContext", () => {
  it("returns hasAccess true with the ensured context for members", async () => {
    getSession.mockResolvedValue(whopSession);
    accountRows.push({ accountId: "user_whop1" });

    const result = await tryResolveWhopContext(new Headers());
    expect(result).toMatchObject({
      hasAccess: true,
      userId: "u1",
      userEmail: "buyer@example.com",
      organizationId: "org_123",
    });
  });

  it("returns hasAccess false when the membership check fails", async () => {
    getSession.mockResolvedValue(whopSession);
    accountRows.push({ accountId: "user_whop1" });
    checkWhopProductAccess.mockResolvedValue(false);

    await expect(tryResolveWhopContext(new Headers())).resolves.toEqual({
      hasAccess: false,
    });
  });

  it("returns hasAccess false when no whop account is linked", async () => {
    getSession.mockResolvedValue(whopSession);
    await expect(tryResolveWhopContext(new Headers())).resolves.toEqual({
      hasAccess: false,
    });
  });

  it("still throws UNAUTHENTICATED when there is no session", async () => {
    getSession.mockResolvedValue(null);
    await expect(tryResolveWhopContext(new Headers())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("still throws AUTH_CONFIG_MISSING when the whop auth config is missing", async () => {
    hasWhopAuthConfig.mockReturnValue(false);
    await expect(tryResolveWhopContext(new Headers())).rejects.toMatchObject({
      code: "AUTH_CONFIG_MISSING",
    });
  });
});
