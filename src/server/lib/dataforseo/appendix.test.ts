import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequiredEnvValue } = vi.hoisted(() => ({
  getRequiredEnvValue: vi.fn(async () => "env-key"),
}));

vi.mock("@/server/lib/runtime-env", () => ({ getRequiredEnvValue }));

import { fetchUserData } from "@/server/lib/dataforseo/appendix";

const USER_DATA_RESPONSE = {
  status_code: 20000,
  tasks: [
    {
      status_code: 20000,
      result: [{ money: { total: 100, balance: 42 } }],
    },
  ],
};

function stubFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(USER_DATA_RESPONSE));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function authorizationHeader(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
): string | null {
  const init = fetchMock.mock.calls[0]?.[1];
  return new Headers(init?.headers).get("Authorization");
}

describe("fetchUserData key resolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getRequiredEnvValue.mockClear();
  });

  it("authenticates with the caller's per-org key when given", async () => {
    const fetchMock = stubFetch();

    const result = await fetchUserData("org-key");

    expect(authorizationHeader(fetchMock)).toBe("Basic org-key");
    expect(getRequiredEnvValue).not.toHaveBeenCalled();
    expect(result?.money?.balance).toBe(42);
  });

  it("falls back to the DATAFORSEO_API_KEY env var without an override", async () => {
    const fetchMock = stubFetch();

    await fetchUserData();

    expect(getRequiredEnvValue).toHaveBeenCalledWith("DATAFORSEO_API_KEY");
    expect(authorizationHeader(fetchMock)).toBe("Basic env-key");
  });
});
