import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { setOrgDataforseoKey, getOrgDataforseoKey } = vi.hoisted(() => ({
  setOrgDataforseoKey: vi.fn(async () => {}),
  getOrgDataforseoKey: vi.fn(async () => null as string | null),
}));
vi.mock("@/server/lib/dataforseo/org-key", () => ({
  setOrgDataforseoKey,
  getOrgDataforseoKey,
}));

import { saveOrgDataforseoKey } from "./org-dataforseo-key";

beforeEach(() => {
  setOrgDataforseoKey.mockClear();
  getOrgDataforseoKey.mockReset();
  getOrgDataforseoKey.mockResolvedValue(null);
});

describe("saveOrgDataforseoKey", () => {
  it("stores the key for the caller's organization", async () => {
    await saveOrgDataforseoKey("org_1", "  b64key  ");
    expect(setOrgDataforseoKey).toHaveBeenCalledWith("org_1", "b64key");
  });

  it("reports configured=true after storing", async () => {
    getOrgDataforseoKey.mockResolvedValue("b64key");
    await expect(saveOrgDataforseoKey("org_1", "b64key")).resolves.toEqual({
      configured: true,
    });
  });
});
