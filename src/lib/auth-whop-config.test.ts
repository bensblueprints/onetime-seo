import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { getWhopOAuthProviderConfig } from "./auth-config";

describe("getWhopOAuthProviderConfig", () => {
  it("builds a whop genericOAuth config from env values", () => {
    const config = getWhopOAuthProviderConfig({
      WHOP_CLIENT_ID: "app_123",
      WHOP_CLIENT_SECRET: "secret_456",
    });
    expect(config.providerId).toBe("whop");
    expect(config.clientId).toBe("app_123");
    expect(config.clientSecret).toBe("secret_456");
    expect(config.authorizationUrl).toBe(
      "https://api.whop.com/oauth/authorize",
    );
    expect(config.tokenUrl).toBe("https://api.whop.com/oauth/token");
    expect(config.userInfoUrl).toBe("https://api.whop.com/oauth/userinfo");
    expect(config.scopes).toEqual(["openid", "profile", "email"]);
    expect(config.pkce).toBe(true);
  });

  it("throws when WHOP_CLIENT_ID is missing", () => {
    expect(() =>
      getWhopOAuthProviderConfig({ WHOP_CLIENT_SECRET: "secret_456" }),
    ).toThrow("WHOP_CLIENT_ID is required in whop mode");
  });

  it("throws when WHOP_CLIENT_SECRET is missing", () => {
    expect(() =>
      getWhopOAuthProviderConfig({ WHOP_CLIENT_ID: "app_123" }),
    ).toThrow("WHOP_CLIENT_SECRET is required in whop mode");
  });
});
