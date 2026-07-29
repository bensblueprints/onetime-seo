import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { getOrCreateBalance, createCustomTopupCheckoutUrl } = vi.hoisted(() => ({
  getOrCreateBalance: vi.fn(),
  createCustomTopupCheckoutUrl: vi.fn(),
}));
vi.mock("@/server/features/credits/creditsService", () => ({
  MONTHLY_BUNDLE_CREDITS: 3000,
  getOrCreateBalance,
}));
vi.mock("@/server/lib/whop/topupCheckout", () => ({
  createCustomTopupCheckoutUrl,
}));
vi.mock("@/serverFunctions/middleware", () => ({
  requireAuthenticatedContext: [],
}));

// No server runtime exists in unit tests, so the server fn wrapper is reduced
// to its handler (same trick as whop.test.ts, extended for the
// .middleware().validator() chain):
// createServerFn().middleware(m).validator(v).handler(h) === h. Handlers are
// then invoked directly with a fake { data, context }.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));

import { AppError } from "@/server/lib/errors";
import {
  TOPUP_PRESET_CHECKOUT_URLS,
  createTopupCheckout,
  getCreditsBalance,
  nearestPresetCheckoutUrl,
  topupCheckoutInputSchema,
} from "./credits";

type Handler = (args: {
  data?: unknown;
  context: Record<string, unknown>;
}) => Promise<unknown>;

const balanceHandler = getCreditsBalance as unknown as Handler;
const checkoutHandler = createTopupCheckout as unknown as Handler;

const subscriptionContext = {
  userId: "user_1",
  userEmail: "user@example.com",
  emailVerified: true,
  organizationId: "org_1",
  whopTier: "subscription",
};

const byokContext = { ...subscriptionContext, whopTier: "byok" };

const storedBalance = {
  organizationId: "org_1",
  monthlyCredits: 1234,
  monthlyPeriodStart: "2026-07-01T00:00:00.000Z",
  topupCredits: 500,
  updatedAt: "2026-07-20T00:00:00.000Z",
};

beforeEach(() => {
  getOrCreateBalance.mockReset();
  createCustomTopupCheckoutUrl.mockReset();
});

describe("getCreditsBalance", () => {
  it("returns the balance shape with reset date for subscription orgs", async () => {
    getOrCreateBalance.mockResolvedValue(storedBalance);
    await expect(
      balanceHandler({ context: subscriptionContext }),
    ).resolves.toEqual({
      enabled: true,
      monthlyCredits: 1234,
      monthlyBundleCredits: 3000,
      monthlyPeriodStart: "2026-07-01T00:00:00.000Z",
      resetAt: "2026-07-31T00:00:00.000Z",
      topupCredits: 500,
    });
    expect(getOrCreateBalance).toHaveBeenCalledWith("org_1");
  });

  it("returns disabled for byok orgs without touching the ledger", async () => {
    await expect(balanceHandler({ context: byokContext })).resolves.toEqual({
      enabled: false,
    });
    expect(getOrCreateBalance).not.toHaveBeenCalled();
  });

  it("returns disabled when the context has no whop tier", async () => {
    const { whopTier: _ignored, ...noTierContext } = subscriptionContext;
    await expect(balanceHandler({ context: noTierContext })).resolves.toEqual({
      enabled: false,
    });
    expect(getOrCreateBalance).not.toHaveBeenCalled();
  });
});

describe("createTopupCheckout", () => {
  it("maps every preset amount to its fixed checkout URL", async () => {
    for (const [amount, url] of Object.entries(TOPUP_PRESET_CHECKOUT_URLS)) {
      await expect(
        checkoutHandler({ data: amount, context: subscriptionContext }),
      ).resolves.toEqual({ url });
    }
    expect(createCustomTopupCheckoutUrl).not.toHaveBeenCalled();
  });

  it("returns the Whop checkout URL for a custom amount", async () => {
    createCustomTopupCheckoutUrl.mockResolvedValue(
      "https://whop.com/checkout/plan_xyz?session=ch_123",
    );
    await expect(
      checkoutHandler({ data: { custom: 75 }, context: subscriptionContext }),
    ).resolves.toEqual({
      url: "https://whop.com/checkout/plan_xyz?session=ch_123",
    });
    expect(createCustomTopupCheckoutUrl).toHaveBeenCalledWith("org_1", 75);
  });

  it("falls back to the nearest preset up when custom checkout is unavailable", async () => {
    createCustomTopupCheckoutUrl.mockResolvedValue(null);
    await expect(
      checkoutHandler({ data: { custom: 75 }, context: subscriptionContext }),
    ).resolves.toEqual({
      url: TOPUP_PRESET_CHECKOUT_URLS["100"],
      note: "rounded",
    });
  });

  it("clamps oversized custom amounts to the largest preset", async () => {
    createCustomTopupCheckoutUrl.mockResolvedValue(null);
    await expect(
      checkoutHandler({ data: { custom: 5000 }, context: subscriptionContext }),
    ).resolves.toEqual({
      url: TOPUP_PRESET_CHECKOUT_URLS["1000"],
      note: "rounded",
    });
  });

  it("rejects byok orgs with FORBIDDEN", async () => {
    await expect(
      checkoutHandler({ data: "10", context: byokContext }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<AppError>);
    expect(createCustomTopupCheckoutUrl).not.toHaveBeenCalled();
  });
});

describe("topupCheckoutInputSchema", () => {
  it("accepts preset amounts and integer custom amounts", () => {
    for (const amount of Object.keys(TOPUP_PRESET_CHECKOUT_URLS)) {
      expect(topupCheckoutInputSchema.safeParse(amount).success).toBe(true);
    }
    expect(topupCheckoutInputSchema.safeParse({ custom: 42 }).success).toBe(
      true,
    );
  });

  it("rejects unknown presets, fractional and out-of-range custom amounts", () => {
    expect(topupCheckoutInputSchema.safeParse("15").success).toBe(false);
    expect(topupCheckoutInputSchema.safeParse({ custom: 1.5 }).success).toBe(
      false,
    );
    expect(topupCheckoutInputSchema.safeParse({ custom: 0 }).success).toBe(
      false,
    );
    expect(topupCheckoutInputSchema.safeParse({ custom: 10001 }).success).toBe(
      false,
    );
  });
});

describe("nearestPresetCheckoutUrl", () => {
  it("rounds up to the nearest preset, inclusive at boundaries", () => {
    expect(nearestPresetCheckoutUrl(1)).toBe(TOPUP_PRESET_CHECKOUT_URLS["10"]);
    expect(nearestPresetCheckoutUrl(10)).toBe(TOPUP_PRESET_CHECKOUT_URLS["10"]);
    expect(nearestPresetCheckoutUrl(11)).toBe(TOPUP_PRESET_CHECKOUT_URLS["20"]);
    expect(nearestPresetCheckoutUrl(75)).toBe(
      TOPUP_PRESET_CHECKOUT_URLS["100"],
    );
    expect(nearestPresetCheckoutUrl(1000)).toBe(
      TOPUP_PRESET_CHECKOUT_URLS["1000"],
    );
    expect(nearestPresetCheckoutUrl(5000)).toBe(
      TOPUP_PRESET_CHECKOUT_URLS["1000"],
    );
  });
});
