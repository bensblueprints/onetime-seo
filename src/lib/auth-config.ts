import { env } from "cloudflare:workers";
import { genericOAuth, organization } from "better-auth/plugins";
import { baseAuthOptions } from "@/lib/auth-options";
import { GSC_OAUTH_PROVIDER_ID, GSC_OAUTH_SCOPES } from "@/shared/gsc";

export type WhopEnvLike = {
  WHOP_CLIENT_ID?: string;
  WHOP_CLIENT_SECRET?: string;
};

export function getWhopOAuthProviderConfig(envLike: WhopEnvLike) {
  const clientId = envLike.WHOP_CLIENT_ID?.trim();
  const clientSecret = envLike.WHOP_CLIENT_SECRET?.trim();

  if (!clientId) {
    throw new Error("WHOP_CLIENT_ID is required in whop mode");
  }
  if (!clientSecret) {
    throw new Error("WHOP_CLIENT_SECRET is required in whop mode");
  }

  return {
    providerId: "whop",
    clientId,
    clientSecret,
    authorizationUrl: "https://api.whop.com/oauth/authorize",
    tokenUrl: "https://api.whop.com/oauth/token",
    userInfoUrl: "https://api.whop.com/oauth/userinfo",
    scopes: ["openid", "profile", "email"],
    pkce: true,
  };
}

export function createBaseAuthConfig() {
  return {
    ...baseAuthOptions,
    advanced: {
      ipAddress: {
        // On Cloudflare Workers the client IP arrives in CF-Connecting-IP;
        // x-forwarded-for (better-auth's default) is absent, so without this
        // getIp() returns null and rate limiting is silently skipped on every
        // /api/auth endpoint. Header lookup is case-insensitive.
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    account: {
      // Encrypt OAuth access/refresh tokens at rest in D1. Also covers the
      // google social-login tokens; the key derives from BETTER_AUTH_SECRET.
      encryptOAuthTokens: true,
      accountLinking: {
        // Allow connecting a Google account whose email differs from the
        // logged-in user's (agency/freelancer managing a client's property).
        allowDifferentEmails: true,
      },
    },
    plugins: [
      // Block user-initiated org creation: each org is its own Autumn customer
      // with its own onboarding-plan credit grant, so an authenticated user
      // hitting POST /api/auth/organization/create could mint unlimited fresh
      // grants. The app gives every user exactly one workspace, created
      // server-side at signup via `auth.api.createOrganization({ body: { userId }})`
      // — that's a "system action" (no session + userId in body) which better-auth
      // exempts from this flag, so the bootstrap keeps working.
      organization({ allowUserToCreateOrganization: false }),
      genericOAuth({
        config: [
          {
            providerId: GSC_OAUTH_PROVIDER_ID,
            clientId: env.GOOGLE_CLIENT_ID?.trim() ?? "",
            clientSecret: env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
            discoveryUrl:
              "https://accounts.google.com/.well-known/openid-configuration",
            scopes: [...GSC_OAUTH_SCOPES],
            accessType: "offline", // request a refresh token
            prompt: "select_account consent",
            pkce: true,
          },
          ...(env.WHOP_CLIENT_ID?.trim() && env.WHOP_CLIENT_SECRET?.trim()
            ? [getWhopOAuthProviderConfig(env)]
            : []),
        ],
      }),
    ],
  };
}
