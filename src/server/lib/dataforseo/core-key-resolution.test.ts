import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { getOrgDataforseoKey, getRequiredEnvValue } = vi.hoisted(() => ({
  getOrgDataforseoKey: vi.fn(async () => null as string | null),
  getRequiredEnvValue: vi.fn(async () => "env-key"),
}));

vi.mock("@/server/lib/dataforseo/org-key", () => ({ getOrgDataforseoKey }));

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue,
  getOptionalEnvValue: vi.fn(async () => "env-key"),
}));

import { resolveDataforseoApiKey } from "./core";

beforeEach(() => {
  getOrgDataforseoKey.mockReset();
  getOrgDataforseoKey.mockResolvedValue(null);
  getRequiredEnvValue.mockClear();
});

describe("resolveDataforseoApiKey", () => {
  it("prefers the org key over the env var", async () => {
    getOrgDataforseoKey.mockResolvedValue("org-key");
    await expect(resolveDataforseoApiKey("org_1")).resolves.toBe("org-key");
  });

  it("falls back to the env var when no org key is stored", async () => {
    await expect(resolveDataforseoApiKey("org_1")).resolves.toBe("env-key");
  });

  it("throws DATAFORSEO_KEY_MISSING when neither exists", async () => {
    getRequiredEnvValue.mockRejectedValue(
      new Error("Missing required environment variable: DATAFORSEO_API_KEY"),
    );
    await expect(resolveDataforseoApiKey("org_1")).rejects.toMatchObject({
      code: "DATAFORSEO_KEY_MISSING",
    });
  });
});
