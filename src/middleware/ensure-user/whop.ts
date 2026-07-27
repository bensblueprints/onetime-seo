import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getAuth, hasWhopAuthConfig } from "@/lib/auth";
import { getActiveOrganizationId } from "@/lib/auth-session";
import { getOrCreateDefaultHostedOrganization } from "@/server/auth/default-hosted-organization";
import { AppError } from "@/server/lib/errors";
import { checkWhopProductAccess } from "@/server/lib/whop/access";
import type { EnsuredUserContext } from "./types";

async function requireWhopSession(headers: Headers) {
  if (!hasWhopAuthConfig()) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Missing Whop auth configuration",
    );
  }

  const session = await getAuth().api.getSession({ headers });

  if (!session?.user?.id || !session.user.email) {
    throw new AppError("UNAUTHENTICATED");
  }

  return session;
}

// The Whop user id lives on the better-auth account row linked by the whop
// genericOAuth provider: its accountId column holds the OIDC `sub` (user_xxx).
async function getWhopAccountId(userId: string) {
  const whopAccount = await db.query.account.findFirst({
    columns: { accountId: true },
    where: and(eq(account.userId, userId), eq(account.providerId, "whop")),
  });

  return whopAccount?.accountId ?? null;
}

export async function resolveWhopContext(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const session = await requireWhopSession(headers);

  const whopAccountId = await getWhopAccountId(session.user.id);
  if (!whopAccountId) {
    throw new AppError("WHOP_ACCESS_DENIED", "No linked Whop account");
  }

  const hasAccess = await checkWhopProductAccess(whopAccountId);
  if (!hasAccess) {
    throw new AppError(
      "WHOP_ACCESS_DENIED",
      "No active OneTime SEO membership",
    );
  }

  const activeOrganizationId = getActiveOrganizationId(session);
  if (activeOrganizationId) {
    return {
      userId: session.user.id,
      userEmail: session.user.email,
      emailVerified: session.user.emailVerified ?? false,
      organizationId: activeOrganizationId,
    };
  }

  const authApi = getAuth().api;
  const organizationId = await getOrCreateDefaultHostedOrganization(
    session.user.id,
    (body) => authApi.createOrganization({ body }),
  );

  await authApi.setActiveOrganization({
    headers,
    body: { organizationId },
  });

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    emailVerified: session.user.emailVerified ?? false,
    organizationId,
  };
}
