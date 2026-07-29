import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  MONTHLY_BUNDLE_CREDITS,
  getOrCreateBalance,
} from "@/server/features/credits/creditsService";
import { AppError } from "@/server/lib/errors";
import { createCustomTopupCheckoutUrl } from "@/server/lib/whop/topupCheckout";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// Every reference to server-only modules must stay inside createServerFn
// handlers: plain exported helpers survive the client-bundle handler strip
// and pull the server module graph (db -> cloudflare:workers) into it.
// The maps and schemas below are pure data, so they are safe to export.

const PRESET_AMOUNTS = ["10", "20", "50", "100", "250", "1000"] as const;
type PresetAmount = (typeof PRESET_AMOUNTS)[number];

/** Fixed Whop checkout URLs for the preset credit packs (credits product). */
export const TOPUP_PRESET_CHECKOUT_URLS: Record<PresetAmount, string> = {
  "10": "https://whop.com/checkout/plan_cvRBoCPxf8BF6",
  "20": "https://whop.com/checkout/plan_C4jysvVVEXZd4",
  "50": "https://whop.com/checkout/plan_0PRaiphubYWhZ",
  "100": "https://whop.com/checkout/plan_hvT0u8ip7cXEC",
  "250": "https://whop.com/checkout/plan_qDxKezVJIQ2Zq",
  "1000": "https://whop.com/checkout/plan_4bhJvqwttrdDo",
};

export const topupCheckoutInputSchema = z.union([
  z.enum(PRESET_AMOUNTS),
  z.object({ custom: z.number().int().min(1).max(10000) }),
]);

/** Smallest preset pack at or above `amountUsd` (clamped to the largest). */
export function nearestPresetCheckoutUrl(amountUsd: number): string {
  for (const amount of PRESET_AMOUNTS) {
    if (amountUsd <= Number(amount)) return TOPUP_PRESET_CHECKOUT_URLS[amount];
  }
  return TOPUP_PRESET_CHECKOUT_URLS["1000"];
}

const MONTHLY_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export const getCreditsBalance = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    if (context.whopTier !== "subscription") {
      // BYOK (and non-Whop) orgs are unmetered — no credit balance to show.
      return { enabled: false as const };
    }

    const balance = await getOrCreateBalance(context.organizationId);
    return {
      enabled: true as const,
      monthlyCredits: balance.monthlyCredits,
      monthlyBundleCredits: MONTHLY_BUNDLE_CREDITS,
      monthlyPeriodStart: balance.monthlyPeriodStart,
      resetAt: new Date(
        Date.parse(balance.monthlyPeriodStart) + MONTHLY_PERIOD_MS,
      ).toISOString(),
      topupCredits: balance.topupCredits,
    };
  });

export const createTopupCheckout = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(topupCheckoutInputSchema)
  .handler(async ({ data, context }) => {
    if (context.whopTier !== "subscription") {
      throw new AppError(
        "FORBIDDEN",
        "Credit top-ups are only available on the subscription plan",
      );
    }

    if (typeof data === "string") {
      return { url: TOPUP_PRESET_CHECKOUT_URLS[data] };
    }

    const customUrl = await createCustomTopupCheckoutUrl(
      context.organizationId,
      data.custom,
    );
    if (customUrl) return { url: customUrl };

    // Whop couldn't create a custom-amount checkout — round up to the
    // nearest preset pack instead of failing the purchase.
    return { url: nearestPresetCheckoutUrl(data.custom), note: "rounded" as const };
  });
