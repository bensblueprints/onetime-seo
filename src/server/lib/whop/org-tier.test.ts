import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { memberFindFirst, accountFindFirst, checkWhopProductAccess } = vi.hoisted(
  () => ({
    memberFindFirst: vi.fn(),
    accountFindFirst: vi.fn(),
    checkWhopProductAccess: vi.fn(),
  }),
);

vi.mock("@/db", () => ({
  db: {
    query: {
      member: { findFirst: memberFindFirst },
      account: { findFirst: accountFindFirst },
    },
  },
}));
vi.mock("@/server/lib/whop/access", () => ({ checkWhopProductAccess }));

import { resolveWhopTierForOrganization } from "./org-tier";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveWhopTierForOrganization", () => {
  it("returns the owner's tier via the linked whop account", async () => {
    memberFindFirst.mockResolvedValue({ userId: "user_1" });
    accountFindFirst.mockResolvedValue({ accountId: "whop_user_1" });
    checkWhopProductAccess.mockResolvedValue({
      hasAccess: true,
      tier: "subscription",
      planIds: ["plan_monthly123"],
    });

    await expect(resolveWhopTierForOrganization("org_1")).resolves.toBe(
      "subscription",
    );
    expect(checkWhopProductAccess).toHaveBeenCalledWith("whop_user_1");
  });

  it("returns byok for a lifetime-plan owner", async () => {
    memberFindFirst.mockResolvedValue({ userId: "user_1" });
    accountFindFirst.mockResolvedValue({ accountId: "whop_user_1" });
    checkWhopProductAccess.mockResolvedValue({
      hasAccess: true,
      tier: "byok",
      planIds: ["plan_EF4Wcn4KXZSAM"],
    });

    await expect(resolveWhopTierForOrganization("org_1")).resolves.toBe("byok");
  });

  it("returns undefined when the org has no owner member", async () => {
    memberFindFirst.mockResolvedValue(undefined);
    await expect(
      resolveWhopTierForOrganization("org_1"),
    ).resolves.toBeUndefined();
    expect(checkWhopProductAccess).not.toHaveBeenCalled();
  });

  it("returns undefined when the owner has no linked whop account", async () => {
    memberFindFirst.mockResolvedValue({ userId: "user_1" });
    accountFindFirst.mockResolvedValue(undefined);
    await expect(
      resolveWhopTierForOrganization("org_1"),
    ).resolves.toBeUndefined();
    expect(checkWhopProductAccess).not.toHaveBeenCalled();
  });

  it("returns undefined when the owner has no active membership", async () => {
    memberFindFirst.mockResolvedValue({ userId: "user_1" });
    accountFindFirst.mockResolvedValue({ accountId: "whop_user_1" });
    checkWhopProductAccess.mockResolvedValue({
      hasAccess: false,
      tier: null,
      planIds: [],
    });

    await expect(
      resolveWhopTierForOrganization("org_1"),
    ).resolves.toBeUndefined();
  });
});
