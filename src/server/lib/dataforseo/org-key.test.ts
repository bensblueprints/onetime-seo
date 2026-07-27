import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(
    async () => "test-secret-key-with-32-characters!!",
  ),
  getOptionalEnvValue: vi.fn(async () => undefined),
}));

const stored = new Map<string, string | null>();
vi.mock("@/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: (values: { dataforseoApiKey: string | null }) => ({
        where: vi.fn(() => {
          const write = () => stored.set("org_1", values.dataforseoApiKey);
          return {
            then: (resolve) => {
              write();
              return Promise.resolve(undefined).then(resolve);
            },
            returning: vi.fn(async () => {
              write();
              return [{ id: "org_1" }];
            }),
          };
        }),
      }),
    })),
    query: {
      organization: {
        findFirst: vi.fn(async () => ({
          dataforseoApiKey: stored.get("org_1") ?? null,
        })),
      },
    },
  },
}));

import {
  getOrgDataforseoKey,
  saveOrgDataforseoKey,
  setOrgDataforseoKey,
} from "./org-key";

beforeEach(() => stored.clear());

describe("org dataforseo key", () => {
  it("round-trips a key through encryption at rest", async () => {
    await setOrgDataforseoKey("org_1", "b64loginpassword");
    expect(stored.get("org_1")).not.toBe("b64loginpassword"); // ciphertext
    expect(stored.get("org_1")).toBeTruthy();
    await expect(getOrgDataforseoKey("org_1")).resolves.toBe(
      "b64loginpassword",
    );
  });

  it("returns null when no key is stored", async () => {
    await expect(getOrgDataforseoKey("org_1")).resolves.toBeNull();
  });

  it("clears the key on empty input", async () => {
    await setOrgDataforseoKey("org_1", "b64loginpassword");
    await setOrgDataforseoKey("org_1", "");
    await expect(getOrgDataforseoKey("org_1")).resolves.toBeNull();
  });

  it("saveOrgDataforseoKey trims and reports configured=true", async () => {
    await expect(
      saveOrgDataforseoKey("org_1", "  b64loginpassword  "),
    ).resolves.toEqual({ configured: true });
    await expect(getOrgDataforseoKey("org_1")).resolves.toBe(
      "b64loginpassword",
    );
  });

  it("saveOrgDataforseoKey reports configured=false for empty input", async () => {
    await expect(saveOrgDataforseoKey("org_1", "   ")).resolves.toEqual({
      configured: false,
    });
  });
});
