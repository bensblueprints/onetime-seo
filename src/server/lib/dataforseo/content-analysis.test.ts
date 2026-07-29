import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { fetchContentAnalysisSearch } from "@/server/lib/dataforseo/content-analysis";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

const CONTENT_ANALYSIS_PATH = ["v3", "content_analysis", "search", "live"];

function searchTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-content",
    status_code: 20000,
    cost: 0.0203,
    path: CONTENT_ANALYSIS_PATH,
    result: [
      {
        total_count: 296,
        items_count: 2,
        items: [
          {
            type: "content_analysis_search",
            url: "https://reviewfinder.ca/top-computer-speakers/edifier-r1280db-vs-logitech-g560/",
            domain: "reviewfinder.ca",
            main_domain: "reviewfinder.ca",
            score: 5900.941,
            page_types: ["ecommerce"],
            social_metrics: [{ type: "facebook", like_count: 13 }],
            content_info: {
              title: "Verdict",
              main_title: "Comparing Edifier R1280DB and Logitech G560",
              snippet: "After counting and adding up the 77 expert endorsements...",
              content_quality_score: 90,
              connotation_types: {
                positive: 0.12,
                negative: 0.41,
                neutral: 0.46,
              },
            },
          },
          {
            type: "content_analysis_search",
            url: "https://reviewfinder.ca/info/top-gaming-racing-wheels/logitech-g920/",
            domain: "reviewfinder.ca",
            main_domain: "reviewfinder.ca",
            score: 5751.833,
            page_types: ["ecommerce"],
            social_metrics: null,
            content_info: {
              title: "Logitech G920 - Recommended and relevant!",
              main_title: "Logitech G920 - Reviews, Prices, Specs and Alternatives",
              snippet: "According to the meta ranking...",
              content_quality_score: 94,
              connotation_types: null,
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("content analysis search live", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the search live endpoint and parses content items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [searchTask()],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchContentAnalysisSearch({
      keyword: "logitech",
      limit: 10,
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual(["https://api.dataforseo.com/v3/content_analysis/search/live"]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([
      {
        keyword: "logitech",
        search_mode: "as_is",
        limit: 10,
      },
    ]);

    expect(result.data.totalCount).toBe(296);
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items[0]).toMatchObject({
      url: "https://reviewfinder.ca/top-computer-speakers/edifier-r1280db-vs-logitech-g560/",
      main_domain: "reviewfinder.ca",
      content_info: {
        main_title: "Comparing Edifier R1280DB and Logitech G560",
        content_quality_score: 90,
        connotation_types: { neutral: 0.46 },
      },
      social_metrics: [{ type: "facebook", like_count: 13 }],
    });
    expect(result.billing).toEqual({
      path: CONTENT_ANALYSIS_PATH,
      costUsd: 0.0203,
    });
  });

  it("clamps the limit into the endpoint's accepted range", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [searchTask()],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchContentAnalysisSearch({ keyword: "logitech", limit: 5000 });

    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([{ limit: 100 }]);
  });

  it("surfaces a charged failed task through the billing envelope", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-content",
            status_code: 40501,
            status_message: "Invalid Field: 'keyword'.",
            cost: 0.0203,
            path: CONTENT_ANALYSIS_PATH,
            data: { keyword: "" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchContentAnalysisSearch({ keyword: "" }),
    ).rejects.toThrow(/Invalid Field/);
  });

  it("rejects a malformed items payload instead of returning garbage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          searchTask({
            result: [
              {
                total_count: 1,
                items: [
                  {
                    type: "content_analysis_search",
                    url: "https://example.com/page",
                    score: "not-a-number",
                  },
                ],
              },
            ],
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchContentAnalysisSearch({ keyword: "logitech" }),
    ).rejects.toThrow(/invalid response shape/);
  });
});
