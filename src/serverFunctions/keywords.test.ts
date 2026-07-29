import { beforeEach, describe, expect, it, vi } from "vitest";

const { exploreContentMock } = vi.hoisted(() => ({
  exploreContentMock: vi.fn(),
}));

// Keep the heavy service graph (drizzle, dataforseo client) out of the test;
// only the wiring from serverFn -> contentExplorer service is under test.
vi.mock("@/server/features/keywords/services/KeywordResearchService", () => ({
  KeywordResearchService: {},
}));
vi.mock("@/server/features/keywords/services/contentExplorer", () => ({
  exploreContent: exploreContentMock,
}));
vi.mock("@/serverFunctions/middleware", () => ({
  requireProjectContext: [],
}));

// No server runtime exists in unit tests, so the server fn wrapper is reduced
// to its handler (same trick as credits.test.ts):
// createServerFn().middleware(m).validator(v).handler(h) === h. Handlers are
// then invoked directly with a fake { data, context }.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));

import { exploreContent } from "./keywords";

type Handler = (args: {
  data?: unknown;
  context: Record<string, unknown>;
}) => Promise<unknown>;

const handler = exploreContent as unknown as Handler;

const context = {
  userId: "user_1",
  organizationId: "org_1",
  projectId: "proj_1",
  project: { id: "proj_1" },
};

const serviceResult = {
  requestedKeyword: "standing desk",
  totalCount: 296,
  items: [
    {
      title: "Best standing desks",
      url: "https://example.com/best-standing-desks",
      domain: "example.com",
      score: 90,
      sentiment: "positive",
      socialShares: 13,
    },
  ],
};

beforeEach(() => {
  exploreContentMock.mockReset();
});

describe("exploreContent", () => {
  it("forwards the keyword and the project from context to the service", async () => {
    exploreContentMock.mockResolvedValue(serviceResult);

    await expect(
      handler({
        data: { projectId: "proj_ignored", keyword: "Standing Desk", limit: 10 },
        context,
      }),
    ).resolves.toEqual(serviceResult);

    expect(exploreContentMock).toHaveBeenCalledWith(
      { projectId: "proj_1", keyword: "Standing Desk", limit: 10 },
      context,
    );
  });

  it("propagates service errors to the caller", async () => {
    exploreContentMock.mockRejectedValue(new Error("upstream down"));

    await expect(
      handler({ data: { keyword: "standing desk" }, context }),
    ).rejects.toThrow("upstream down");
  });
});
