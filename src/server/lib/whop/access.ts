import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheEntry = { hasAccess: boolean; checkedAt: number };
const accessCache = new Map<string, CacheEntry>();

export function _clearWhopAccessCache() {
  accessCache.clear();
}

async function fetchWhopAccess(whopUserId: string): Promise<boolean> {
  const apiKey = await getOptionalEnvValue("WHOP_API_KEY");
  const productId = await getOptionalEnvValue("WHOP_PRODUCT_ID");
  if (!apiKey || !productId) {
    throw new Error("WHOP_API_KEY and WHOP_PRODUCT_ID are required in whop mode");
  }

  const response = await fetch(
    `https://api.whop.com/api/v1/users/${whopUserId}/access/${productId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!response.ok) {
    throw new Error(`Whop access check failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { has_access?: boolean };
  return body.has_access === true;
}

export async function checkWhopProductAccess(
  whopUserId: string,
): Promise<boolean> {
  const cached = accessCache.get(whopUserId);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.hasAccess;
  }

  try {
    const hasAccess = await fetchWhopAccess(whopUserId);
    accessCache.set(whopUserId, { hasAccess, checkedAt: Date.now() });
    return hasAccess;
  } catch (error) {
    // Grace: if Whop is unreachable but we have any prior answer, keep it
    // rather than locking users out during a Whop outage.
    if (cached) {
      return cached.hasAccess;
    }
    throw error;
  }
}
