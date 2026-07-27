import { beforeEach, describe, expect, it, vi } from "vitest";

const { kvGet, kvPut, getRequiredEnvValue } = vi.hoisted(() => ({
  kvGet: vi.fn(async () => null),
  kvPut: vi.fn(async () => undefined),
  getRequiredEnvValue: vi.fn(async () => "env-key"),
}));

vi.mock("cloudflare:workers", () => ({
  env: { KV: { get: kvGet, put: kvPut } },
}));

vi.mock("@/server/lib/runtime-env", () => ({ getRequiredEnvValue }));

import { fetchSerpLocationsForCountry } from "@/server/lib/dataforseo/serp-locations";

const LOCATIONS_RESPONSE = {
  status_code: 20000,
  tasks: [
    {
      status_code: 20000,
      result: [
        { location_code: 1, location_name: "New York", location_type: "City" },
      ],
    },
  ],
};

function stubFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(LOCATIONS_RESPONSE));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function authorizationHeader(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
): string | null {
  const init = fetchMock.mock.calls[0]?.[1];
  return new Headers(init?.headers).get("Authorization");
}

describe("fetchSerpLocationsForCountry key resolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    kvGet.mockClear();
    kvPut.mockClear();
    getRequiredEnvValue.mockClear();
  });

  it("authenticates the origin fetch with the caller's per-org key", async () => {
    const fetchMock = stubFetch();

    const result = await fetchSerpLocationsForCountry("us", "org-key");

    expect(authorizationHeader(fetchMock)).toBe("Basic org-key");
    // The override key is used as-is; the env var is never read.
    expect(getRequiredEnvValue).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("falls back to the DATAFORSEO_API_KEY env var without an override", async () => {
    const fetchMock = stubFetch();

    await fetchSerpLocationsForCountry("us");

    expect(getRequiredEnvValue).toHaveBeenCalledWith("DATAFORSEO_API_KEY");
    expect(authorizationHeader(fetchMock)).toBe("Basic env-key");
  });
});
