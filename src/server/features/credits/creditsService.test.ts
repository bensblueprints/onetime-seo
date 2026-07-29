import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

type Balance = {
  organizationId: string;
  monthlyCredits: number;
  monthlyPeriodStart: string;
  topupCredits: number;
  updatedAt: string;
};

// In-memory stand-in for the organization_credit_balance table. Tests use a
// single org ("org_1"), so the mock ignores `where` conditions and applies
// `set` values directly — the same style as src/server/lib/dataforseo/org-key.test.ts.
const stored: { row: Balance | null } = { row: null };

vi.mock("@/db", () => ({
  db: {
    query: {
      organizationCreditBalance: {
        findFirst: vi.fn(async () => stored.row ?? undefined),
      },
    },
    insert: vi.fn(() => ({
      values: (values: Balance) => ({
        onConflictDoNothing: () => ({
          returning: vi.fn(async () => {
            if (stored.row) return [];
            stored.row = { ...values };
            return [stored.row];
          }),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (values: Partial<Balance>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (!stored.row) return [];
            stored.row = { ...stored.row, ...values };
            return [stored.row];
          }),
        })),
      }),
    })),
  },
}));

import {
  MONTHLY_BUNDLE_CREDITS,
  addTopupCredits,
  creditsForRawCost,
  deductCredits,
  getOrCreateBalance,
  resetMonthlyIfDue,
} from "./creditsService";
import { AppError } from "@/server/lib/errors";

const ORG_ID = "org_1";
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_START = "2026-01-01T00:00:00.000Z";

beforeEach(() => {
  stored.row = null;
});

async function seedBalance(overrides: Partial<Balance> = {}): Promise<Balance> {
  const balance = await getOrCreateBalance(ORG_ID);
  Object.assign(stored.row as Balance, overrides);
  return { ...balance, ...overrides };
}

describe("creditsForRawCost", () => {
  it("converts raw USD cost to credits at 3x markup, rounding up", () => {
    expect(creditsForRawCost(0.032)).toBe(10); // ceil(9.6)
    expect(creditsForRawCost(1)).toBe(300);
    expect(creditsForRawCost(0)).toBe(0);
  });
});

describe("getOrCreateBalance", () => {
  it("seeds the monthly bundle on first touch", async () => {
    const balance = await getOrCreateBalance(ORG_ID);

    expect(balance.monthlyCredits).toBe(MONTHLY_BUNDLE_CREDITS);
    expect(balance.topupCredits).toBe(0);
    expect(balance.monthlyPeriodStart).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(balance.updatedAt).toBe(balance.monthlyPeriodStart);

    // Second touch returns the same row without re-seeding.
    const again = await getOrCreateBalance(ORG_ID);
    expect(again).toEqual(balance);
  });
});

describe("deductCredits", () => {
  it("deducts from the monthly bucket only when it covers the amount", async () => {
    await seedBalance({ monthlyPeriodStart: PERIOD_START });

    const balance = await deductCredits(ORG_ID, 500);

    expect(balance.monthlyCredits).toBe(MONTHLY_BUNDLE_CREDITS - 500);
    expect(balance.topupCredits).toBe(0);
  });

  it("splits a deduction across monthly then top-up", async () => {
    await seedBalance({ monthlyPeriodStart: PERIOD_START });
    await deductCredits(ORG_ID, 2500); // monthly: 500 left
    await addTopupCredits(ORG_ID, 2000);

    const balance = await deductCredits(ORG_ID, 1000);

    expect(balance.monthlyCredits).toBe(0);
    expect(balance.topupCredits).toBe(1500);
  });

  it("deducts from top-up only once monthly is exhausted", async () => {
    await seedBalance({ monthlyPeriodStart: PERIOD_START });
    await deductCredits(ORG_ID, MONTHLY_BUNDLE_CREDITS); // monthly: 0
    await addTopupCredits(ORG_ID, 500);

    const balance = await deductCredits(ORG_ID, 200);

    expect(balance.monthlyCredits).toBe(0);
    expect(balance.topupCredits).toBe(300);
  });

  it("throws INSUFFICIENT_CREDITS with current balances when short", async () => {
    await seedBalance({ monthlyPeriodStart: PERIOD_START });
    await deductCredits(ORG_ID, 1000); // monthly: 2000
    await addTopupCredits(ORG_ID, 100); // total: 2100

    const error = await deductCredits(ORG_ID, 2101).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe("INSUFFICIENT_CREDITS");
    expect(appError.message).toContain("2000");
    expect(appError.message).toContain("100");
    expect(appError.details).toEqual({
      requestedCredits: "2101",
      monthlyCredits: "2000",
      topupCredits: "100",
    });
    // Nothing was deducted.
    expect(stored.row?.monthlyCredits).toBe(2000);
    expect(stored.row?.topupCredits).toBe(100);
  });
});

describe("resetMonthlyIfDue", () => {
  it("resets at exactly 30 days", async () => {
    await seedBalance({ monthlyPeriodStart: PERIOD_START });
    await deductCredits(ORG_ID, 1234);
    await addTopupCredits(ORG_ID, 250);

    const balance = await resetMonthlyIfDue(
      ORG_ID,
      new Date(Date.parse(PERIOD_START) + 30 * DAY_MS),
    );

    expect(balance?.monthlyCredits).toBe(MONTHLY_BUNDLE_CREDITS);
    expect(balance?.monthlyPeriodStart).toBe("2026-01-31T00:00:00.000Z");
    expect(balance?.topupCredits).toBe(250); // untouched
  });

  it("catches up multiple periods when long overdue", async () => {
    await seedBalance({ monthlyPeriodStart: PERIOD_START });

    // 95 days later = 3 full periods elapsed; anchor advances by 90 days.
    const balance = await resetMonthlyIfDue(
      ORG_ID,
      new Date(Date.parse(PERIOD_START) + 95 * DAY_MS),
    );

    expect(balance?.monthlyCredits).toBe(MONTHLY_BUNDLE_CREDITS);
    expect(balance?.monthlyPeriodStart).toBe("2026-04-01T00:00:00.000Z");
  });

  it("does not reset before the period is due", async () => {
    await seedBalance({ monthlyPeriodStart: PERIOD_START });
    await deductCredits(ORG_ID, 1234); // monthly: 1766

    const balance = await resetMonthlyIfDue(
      ORG_ID,
      new Date(Date.parse(PERIOD_START) + 29 * DAY_MS),
    );

    expect(balance?.monthlyCredits).toBe(1766);
    expect(balance?.monthlyPeriodStart).toBe(PERIOD_START);
  });

  it("returns null when the org has no balance row", async () => {
    await expect(
      resetMonthlyIfDue(ORG_ID, new Date("2026-06-01T00:00:00.000Z")),
    ).resolves.toBeNull();
    expect(stored.row).toBeNull();
  });
});

describe("addTopupCredits", () => {
  it("accumulates top-up credits across calls", async () => {
    await addTopupCredits(ORG_ID, 1000);
    const balance = await addTopupCredits(ORG_ID, 500);

    expect(balance.topupCredits).toBe(1500);
    // First touch still seeds the monthly bundle.
    expect(balance.monthlyCredits).toBe(MONTHLY_BUNDLE_CREDITS);
  });
});
