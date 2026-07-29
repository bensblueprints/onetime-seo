import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type WhopTier = "byok" | "subscription";

export type WhopAccessResult =
  | { hasAccess: false; tier: null; planIds: string[] }
  | { hasAccess: true; tier: WhopTier; planIds: string[] };

type CacheEntry = WhopAccessResult & { checkedAt: number };
const accessCache = new Map<string, CacheEntry>();

export function _clearWhopAccessCache() {
  accessCache.clear();
}

function toResult(entry: CacheEntry): WhopAccessResult {
  return entry.hasAccess
    ? { hasAccess: true, tier: entry.tier, planIds: entry.planIds }
    : { hasAccess: false, tier: null, planIds: entry.planIds };
}

async function fetchWhopAccess(
  whopUserId: string,
  apiKey: string,
  productId: string,
): Promise<boolean> {
  const response = await fetch(
    `https://api.whop.com/api/v1/users/${whopUserId}/access/${productId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!response.ok) {
    throw new Error(`Whop access check failed: HTTP ${response.status}`);
  }
  const body: { has_access?: boolean } = await response.json();
  return body.has_access === true;
}

// Plan ids of the user's ACTIVE memberships on the product, via the Whop
// memberships list API (GET /api/v1/memberships?company_id=..&user_ids=..&product_ids=..&statuses=active).
// company_id is required by Whop for API-key auth (without it the API returns
// an authorization error and tier resolution silently degrades to byok).
async function fetchActiveMembershipPlanIds(
  whopUserId: string,
  apiKey: string,
  productId: string,
  companyId: string,
): Promise<string[]> {
  const url = new URL("https://api.whop.com/api/v1/memberships");
  url.searchParams.set("company_id", companyId);
  url.searchParams.set("user_ids", whopUserId);
  url.searchParams.set("product_ids", productId);
  url.searchParams.set("statuses", "active");
  // A user realistically holds a handful of memberships per product; one page
  // of 50 covers it, and overflow would degrade toward byok (user-pays, safe).
  url.searchParams.set("first", "50");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Whop memberships list failed: HTTP ${response.status}`);
  }
  const body: { data?: Array<{ plan?: { id?: string } | null }> } =
    await response.json();
  return (body.data ?? [])
    .map((membership) => membership.plan?.id)
    .filter((id): id is string => typeof id === "string");
}

export async function checkWhopProductAccess(
  whopUserId: string,
): Promise<WhopAccessResult> {
  const cached = accessCache.get(whopUserId);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return toResult(cached);
  }

  try {
    const apiKey = await getOptionalEnvValue("WHOP_API_KEY");
    const productId = await getOptionalEnvValue("WHOP_PRODUCT_ID");
    const companyId = await getOptionalEnvValue("WHOP_COMPANY_ID");
    if (!apiKey || !productId || !companyId) {
      throw new Error("WHOP_API_KEY, WHOP_PRODUCT_ID and WHOP_COMPANY_ID are required in whop mode");
    }

    // The access check stays the primary gate: has_access false → denied,
    // regardless of what the memberships API would say.
    const hasAccess = await fetchWhopAccess(whopUserId, apiKey, productId);
    if (!hasAccess) {
      const result: WhopAccessResult = {
        hasAccess: false,
        tier: null,
        planIds: [],
      };
      accessCache.set(whopUserId, { ...result, checkedAt: Date.now() });
      return result;
    }

    // Tier resolution only. A memberships-API failure never blocks access:
    // the cached tier wins, otherwise we default to byok-with-grace (BYOK
    // members use their own key, so misclassifying a subscription user as
    // byok during a Whop outage just skips credit metering for that window).
    let planIds: string[] | null = null;
    try {
      planIds = await fetchActiveMembershipPlanIds(whopUserId, apiKey, productId, companyId);
    } catch {
      planIds = null;
    }

    let tier: WhopTier;
    let resolvedPlanIds: string[];
    if (planIds !== null) {
      const monthlyPlanId = await getOptionalEnvValue("WHOP_MONTHLY_PLAN_ID");
      if (!monthlyPlanId) {
        // Safe error: without the monthly plan id we cannot distinguish the
        // tiers, and silently guessing could mis-bill a subscription member.
        throw new Error(
          "WHOP_MONTHLY_PLAN_ID is required to resolve the Whop membership tier",
        );
      }
      tier = planIds.includes(monthlyPlanId) ? "subscription" : "byok";
      resolvedPlanIds = planIds;
    } else {
      tier = cached?.hasAccess ? cached.tier : "byok";
      resolvedPlanIds = cached?.planIds ?? [];
    }

    const result: WhopAccessResult = { hasAccess: true, tier, planIds: resolvedPlanIds };
    accessCache.set(whopUserId, { ...result, checkedAt: Date.now() });
    return result;
  } catch (error) {
    // Grace: if Whop is unreachable but we have any prior answer, keep it
    // rather than locking users out during a Whop outage.
    if (cached) {
      return toResult(cached);
    }
    throw error;
  }
}
