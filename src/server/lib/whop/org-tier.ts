import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, member } from "@/db/schema";
import {
  checkWhopProductAccess,
  type WhopTier,
} from "@/server/lib/whop/access";

// Resolve an organization's Whop tier without a request context (cron paths).
// Goes org → owner member → linked whop account → the same cached membership
// check used by request gating. Returns undefined when the org has no whop
// linkage (self-host modes) or the membership can't be resolved — callers
// treat undefined as "unmetered", matching the request-path default.
export async function resolveWhopTierForOrganization(
  organizationId: string,
): Promise<WhopTier | undefined> {
  const owner = await db.query.member.findFirst({
    columns: { userId: true },
    where: and(
      eq(member.organizationId, organizationId),
      eq(member.role, "owner"),
    ),
  });
  if (!owner) {
    return undefined;
  }

  const whopAccount = await db.query.account.findFirst({
    columns: { accountId: true },
    where: and(
      eq(account.userId, owner.userId),
      eq(account.providerId, "whop"),
    ),
  });
  if (!whopAccount) {
    return undefined;
  }

  const access = await checkWhopProductAccess(whopAccount.accountId);
  return access.hasAccess ? access.tier : undefined;
}
