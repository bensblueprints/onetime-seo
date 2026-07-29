import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

type Balance = {
  organizationId: string;
  monthlyCredits: number;
  monthlyPeriodStart: string;
  topupCredits: number;
  updatedAt: string;
};

// Replace drizzle's `lte` with a marker object so the in-memory mock below can
// evaluate the due-row WHERE clause (everything else from drizzle-orm stays
// real for the schema import). Same in-memory style as creditsService.test.ts,
// extended to multiple rows.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    lte: (column: { name: string }, value: unknown) => ({
      __lteColumn: column.name,
      __lteValue: value,
    }),
  };
});

const stored: { rows: Balance[] } = { rows: [] };

const toCamelCase = (name: string) =>
  name.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: (values: Partial<Balance>) => ({
        where: vi.fn(
          (condition: { __lteColumn?: string; __lteValue?: unknown }) => ({
            returning: vi.fn(async () => {
              const updated: Balance[] = [];
              stored.rows = stored.rows.map((row) => {
                const matches = condition.__lteColumn
                  ? String(
                      row[toCamelCase(condition.__lteColumn) as keyof Balance],
                    ) <= String(condition.__lteValue)
                  : true;
                if (!matches) return row;
                const next = { ...row, ...values };
                updated.push(next);
                return next;
              });
              return updated;
            }),
          }),
        ),
      }),
    })),
  },
}));

import {
  MONTHLY_BUNDLE_CREDITS,
  resetDueMonthlyBalances,
} from "./creditsService";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00.000Z");

function seedRow(
  overrides: Partial<Balance> & { organizationId: string },
): Balance {
  const row: Balance = {
    monthlyCredits: 0,
    monthlyPeriodStart: NOW.toISOString(),
    topupCredits: 0,
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
  stored.rows.push(row);
  return row;
}

const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * DAY_MS).toISOString();

const findRow = (organizationId: string) =>
  stored.rows.find((row) => row.organizationId === organizationId);

beforeEach(() => {
  stored.rows = [];
});

describe("resetDueMonthlyBalances", () => {
  it("resets only due rows and leaves fresh rows untouched", async () => {
    const fresh = seedRow({
      organizationId: "org_fresh",
      monthlyCredits: 700,
      monthlyPeriodStart: daysAgo(10),
      topupCredits: 50,
      updatedAt: daysAgo(3),
    });
    seedRow({
      organizationId: "org_due",
      monthlyCredits: 120,
      monthlyPeriodStart: daysAgo(45),
      topupCredits: 500,
      updatedAt: daysAgo(45),
    });

    const resetCount = await resetDueMonthlyBalances(NOW);

    expect(resetCount).toBe(1);

    const dueRow = findRow("org_due");
    expect(dueRow?.monthlyCredits).toBe(MONTHLY_BUNDLE_CREDITS);
    expect(dueRow?.monthlyPeriodStart).toBe(NOW.toISOString());
    expect(dueRow?.updatedAt).toBe(NOW.toISOString());
    expect(dueRow?.topupCredits).toBe(500); // top-up bucket untouched

    expect(findRow("org_fresh")).toEqual(fresh); // fresh row fully untouched
  });

  it("treats a period start exactly 30 days ago as due", async () => {
    seedRow({
      organizationId: "org_boundary",
      monthlyCredits: 0,
      monthlyPeriodStart: daysAgo(30),
    });

    const resetCount = await resetDueMonthlyBalances(NOW);

    expect(resetCount).toBe(1);
    expect(findRow("org_boundary")?.monthlyCredits).toBe(
      MONTHLY_BUNDLE_CREDITS,
    );
  });

  it("is a no-op when no rows are due", async () => {
    const fresh = seedRow({
      organizationId: "org_fresh",
      monthlyCredits: 1234,
      monthlyPeriodStart: daysAgo(29),
      topupCredits: 10,
    });

    const resetCount = await resetDueMonthlyBalances(NOW);

    expect(resetCount).toBe(0);
    expect(findRow("org_fresh")).toEqual(fresh);
  });

  it("resets all due rows in a single run (idempotent on re-run)", async () => {
    seedRow({ organizationId: "org_a", monthlyPeriodStart: daysAgo(31) });
    seedRow({ organizationId: "org_b", monthlyPeriodStart: daysAgo(90) });

    expect(await resetDueMonthlyBalances(NOW)).toBe(2);
    for (const row of stored.rows) {
      expect(row.monthlyCredits).toBe(MONTHLY_BUNDLE_CREDITS);
      expect(row.monthlyPeriodStart).toBe(NOW.toISOString());
    }

    // Immediately re-running resets nothing — the rows are no longer due.
    expect(await resetDueMonthlyBalances(NOW)).toBe(0);
  });
});
