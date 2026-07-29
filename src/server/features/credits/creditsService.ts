import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { organizationCreditBalance } from "@/db/schema";
import { AppError } from "@/server/lib/errors";

/** Monthly subscription bundle: 3,000 credits = $10 of raw DataForSEO spend at 3×. */
export const MONTHLY_BUNDLE_CREDITS = 3000;

/** Platform markup applied over raw DataForSEO cost. */
export const MARKUP = 3;

/** The monthly bundle resets on a fixed 30-day cycle anchored at monthlyPeriodStart. */
const MONTHLY_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export type CreditBalance = typeof organizationCreditBalance.$inferSelect;

/** 1 credit = $0.01 of marked-up DataForSEO cost (raw × MARKUP, in cents). */
export function creditsForRawCost(rawCostUsd: number): number {
  return Math.ceil(rawCostUsd * MARKUP * 100);
}

type BalanceSnapshot = Pick<
  CreditBalance,
  "monthlyCredits" | "topupCredits"
>;

function insufficientCreditsError(
  balance: BalanceSnapshot,
  requestedCredits: number,
): AppError {
  return new AppError(
    "INSUFFICIENT_CREDITS",
    `Insufficient credits: requested ${requestedCredits}, but only ${balance.monthlyCredits} monthly + ${balance.topupCredits} top-up credits remain.`,
    {
      requestedCredits: String(requestedCredits),
      monthlyCredits: String(balance.monthlyCredits),
      topupCredits: String(balance.topupCredits),
    },
  );
}

async function findBalance(
  organizationId: string,
): Promise<CreditBalance | undefined> {
  return db.query.organizationCreditBalance.findFirst({
    where: eq(organizationCreditBalance.organizationId, organizationId),
  });
}

/**
 * Returns the org's credit balance, creating it on first touch. First touch
 * seeds the monthly bundle and anchors the 30-day period at now — subscription
 * orgs start with a full bundle, and a top-up-only org gets the seed too.
 */
export async function getOrCreateBalance(
  organizationId: string,
): Promise<CreditBalance> {
  const existing = await findBalance(organizationId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizationCreditBalance)
    .values({
      organizationId,
      monthlyCredits: MONTHLY_BUNDLE_CREDITS,
      monthlyPeriodStart: now,
      topupCredits: 0,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;

  // Lost the insert race — the other writer's row is now visible.
  const raced = await findBalance(organizationId);
  if (!raced) {
    throw new Error(`Failed to create credit balance for ${organizationId}`);
  }
  return raced;
}

/**
 * Pre-call gate for metered paths: throws AppError INSUFFICIENT_CREDITS when
 * the org has no credits left in either bucket, so the metered call never
 * executes (mirrors the hosted Autumn path's check-then-meter shape). Returns
 * the balance otherwise.
 */
export async function assertCreditsAvailable(
  organizationId: string,
): Promise<CreditBalance> {
  const balance = await getOrCreateBalance(organizationId);
  if (balance.monthlyCredits + balance.topupCredits <= 0) {
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      `Insufficient credits: ${balance.monthlyCredits} monthly + ${balance.topupCredits} top-up credits remain.`,
      {
        monthlyCredits: String(balance.monthlyCredits),
        topupCredits: String(balance.topupCredits),
      },
    );
  }
  return balance;
}

/**
 * Deducts `credits` from the org's balance, spending the monthly bundle first
 * and the top-up bucket second (mirrors the Autumn split-bucket logic in
 * src/server/billing/subscription.ts). Throws AppError INSUFFICIENT_CREDITS
 * with the current balances when the total can't cover the deduction.
 */
export async function deductCredits(
  organizationId: string,
  credits: number,
): Promise<CreditBalance> {
  // Bounded retries: a monthly reset committing between our read and write
  // invalidates the arithmetic; the periodStart guard below makes that
  // interleaving a miss instead of a lost update, and we retry on fresh state.
  const MAX_ATTEMPTS = 3;
  let balance = await getOrCreateBalance(organizationId);
  if (credits <= 0) return balance;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (balance.monthlyCredits + balance.topupCredits < credits) {
      throw insufficientCreditsError(balance, credits);
    }

    const monthlyDeduct = Math.min(balance.monthlyCredits, credits);
    const topupDeduct = credits - monthlyDeduct;

    // Atomic: the gte guards re-check both buckets at write time, so a
    // concurrent deduction can never push either bucket negative, and the
    // periodStart equality guard makes a concurrent monthly reset a miss
    // (retry with fresh numbers) instead of clobbering the new bundle with
    // stale-balance arithmetic.
    const [row] = await db
      .update(organizationCreditBalance)
      .set({
        monthlyCredits: balance.monthlyCredits - monthlyDeduct,
        topupCredits: balance.topupCredits - topupDeduct,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(organizationCreditBalance.organizationId, organizationId),
          eq(organizationCreditBalance.monthlyPeriodStart, balance.monthlyPeriodStart),
          gte(organizationCreditBalance.monthlyCredits, monthlyDeduct),
          gte(organizationCreditBalance.topupCredits, topupDeduct),
        ),
      )
      .returning();
    if (row) return row;

    // A concurrent write (deduction or reset) moved the state — re-read and
    // either retry against fresh values or fail with the current balances.
    const current = await findBalance(organizationId);
    if (!current) {
      throw insufficientCreditsError(balance, credits);
    }
    balance = current;
  }

  throw insufficientCreditsError(balance, credits);
}

/**
 * Resets the monthly bundle when the current 30-day period has elapsed.
 * Advances monthlyPeriodStart by whole 30-day periods (catching up multiple
 * periods when long overdue) so the anchor stays on schedule. Top-up credits
 * are never touched. No-op (returns null) when the org has no balance row.
 */
export async function resetMonthlyIfDue(
  organizationId: string,
  now: Date,
): Promise<CreditBalance | null> {
  const balance = await findBalance(organizationId);
  if (!balance) return null;

  const periodStartMs = Date.parse(balance.monthlyPeriodStart);
  const elapsedMs = now.getTime() - periodStartMs;
  if (elapsedMs < MONTHLY_PERIOD_MS) return balance;

  const periodsElapsed = Math.floor(elapsedMs / MONTHLY_PERIOD_MS);
  const newPeriodStart = new Date(
    periodStartMs + periodsElapsed * MONTHLY_PERIOD_MS,
  ).toISOString();

  const [row] = await db
    .update(organizationCreditBalance)
    .set({
      monthlyCredits: MONTHLY_BUNDLE_CREDITS,
      monthlyPeriodStart: newPeriodStart,
      updatedAt: now.toISOString(),
    })
    .where(
      and(
        eq(organizationCreditBalance.organizationId, organizationId),
        // CAS guard: only reset the period we read, so concurrent resets
        // can't double-credit the bundle.
        eq(
          organizationCreditBalance.monthlyPeriodStart,
          balance.monthlyPeriodStart,
        ),
      ),
    )
    .returning();
  if (row) return row;

  // Another writer already advanced the period — return its result.
  return (await findBalance(organizationId)) ?? balance;
}

/**
 * Batch variant of resetMonthlyIfDue for the scheduled run: one conditional
 * UPDATE resets every balance whose 30-day period has elapsed. Unlike the
 * per-org path (which advances the anchor by whole periods), due rows are
 * re-anchored at `now` — a set-based statement can't do per-row arithmetic,
 * and the 15-minute cron cadence keeps the drift negligible. Top-up credits
 * are never touched. No-op (returns 0) when nothing is due.
 */
export async function resetDueMonthlyBalances(now: Date): Promise<number> {
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - MONTHLY_PERIOD_MS).toISOString();
  const rows = await db
    .update(organizationCreditBalance)
    .set({
      monthlyCredits: MONTHLY_BUNDLE_CREDITS,
      monthlyPeriodStart: nowIso,
      updatedAt: nowIso,
    })
    // ISO-8601 UTC strings compare lexicographically, so a text <= works.
    .where(lte(organizationCreditBalance.monthlyPeriodStart, cutoffIso))
    .returning({ organizationId: organizationCreditBalance.organizationId });
  return rows.length;
}

/**
 * Adds paid top-up credits (never reset by the monthly cycle). Creates the
 * balance row on first touch — a top-up-only org gets the monthly bundle
 * seeded as well.
 */
export async function addTopupCredits(
  organizationId: string,
  credits: number,
): Promise<CreditBalance> {
  const balance = await getOrCreateBalance(organizationId);
  const [row] = await db
    .update(organizationCreditBalance)
    .set({
      topupCredits: balance.topupCredits + credits,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organizationCreditBalance.organizationId, organizationId))
    .returning();
  if (!row) {
    throw new Error(`Failed to add top-up credits for ${organizationId}`);
  }
  return row;
}
