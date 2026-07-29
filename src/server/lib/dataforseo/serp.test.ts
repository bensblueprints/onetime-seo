import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchAmazonSerp,
  fetchBingSerp,
  fetchRankCheckTaskResult,
  fetchYoutubeSerp,
  postRankCheckTasks,
} from "@/server/lib/dataforseo/serp";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

describe("bing organic live serp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the bing live endpoint and parses organic items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-bing",
            status_code: 20000,
            cost: 0.002,
            path: ["v3", "serp", "bing", "organic", "live", "advanced"],
            result: [
              {
                items: [
                  {
                    type: "organic",
                    rank_group: 1,
                    rank_absolute: 2,
                    domain: "www.example.com",
                    title: "Example Page",
                    url: "https://www.example.com/page",
                    description: "An example snippet.",
                  },
                  {
                    type: "paid",
                    rank_group: 1,
                    rank_absolute: 1,
                    domain: "ads.example.com",
                    title: "Ad",
                    url: "https://ads.example.com",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBingSerp({
      keyword: "alpha",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual([
      "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced",
    ]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([
      {
        keyword: "alpha",
        location_code: 2840,
        language_code: "en",
        device: "desktop",
        os: "windows",
        depth: 100,
      },
    ]);
    // All item types are returned (feature mappers filter to organic), with
    // rank/title/url/description preserved.
    expect(result.data[0]).toMatchObject({
      type: "organic",
      rank_absolute: 2,
      domain: "www.example.com",
      title: "Example Page",
      url: "https://www.example.com/page",
      description: "An example snippet.",
    });
    expect(result.billing).toEqual({
      path: ["v3", "serp", "bing", "organic", "live", "advanced"],
      costUsd: 0.002,
    });
  });
});

describe("youtube organic live serp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the youtube live endpoint and parses video items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-youtube",
            status_code: 20000,
            cost: 0.002,
            path: ["v3", "serp", "youtube", "organic", "live", "advanced"],
            result: [
              {
                items: [
                  {
                    type: "youtube_video",
                    rank_group: 1,
                    rank_absolute: 1,
                    title: "A video",
                    url: "https://www.youtube.com/watch?v=abc123",
                    video_id: "abc123",
                    channel_id: "UC123",
                    channel_name: "Example Channel",
                    channel_url: "https://www.youtube.com/@example",
                    description: "A video snippet.",
                  },
                  {
                    type: "youtube_channel",
                    rank_group: 1,
                    rank_absolute: 2,
                    name: "Example Channel",
                    url: "https://www.youtube.com/@example",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeSerp({
      keyword: "alpha",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual([
      "https://api.dataforseo.com/v3/serp/youtube/organic/live/advanced",
    ]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([
      {
        keyword: "alpha",
        location_code: 2840,
        language_code: "en",
        device: "desktop",
        os: "windows",
      },
    ]);
    expect(result.data[0]).toMatchObject({
      type: "youtube_video",
      rank_absolute: 1,
      title: "A video",
      url: "https://www.youtube.com/watch?v=abc123",
      video_id: "abc123",
      channel_name: "Example Channel",
      description: "A video snippet.",
    });
    expect(result.billing).toEqual({
      path: ["v3", "serp", "youtube", "organic", "live", "advanced"],
      costUsd: 0.002,
    });
  });

  it("surfaces a charged failed task through the billing envelope", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-youtube",
            status_code: 40501,
            status_message: "Invalid Field: 'location_code'.",
            cost: 0.002,
            path: ["v3", "serp", "youtube", "organic", "live", "advanced"],
            data: { location_code: 999999 },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchYoutubeSerp({
        keyword: "alpha",
        locationCode: 999999,
        languageCode: "en",
      }),
    ).rejects.toThrow(/Invalid Field/);
  });
});

describe("amazon organic live serp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the amazon live endpoint and parses product items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-amazon",
            status_code: 20000,
            cost: 0.002,
            path: ["v3", "serp", "amazon", "organic", "live", "advanced"],
            result: [
              {
                items: [
                  {
                    type: "amazon_organic",
                    rank_group: 1,
                    rank_absolute: 1,
                    domain: "www.amazon.com",
                    title: "Example Product",
                    url: "https://www.amazon.com/dp/B07G82D89J",
                    image_url: "https://m.media-amazon.com/images/I/example.jpg",
                    price_from: 49.98,
                    price_to: null,
                    currency: "USD",
                    rating: {
                      rating_type: "Max5",
                      value: 4.6,
                      votes_count: 12345,
                      rating_max: 5,
                    },
                    is_amazon_choice: true,
                    is_best_seller: false,
                    data_asin: "B07G82D89J",
                  },
                  {
                    type: "amazon_paid",
                    rank_group: 1,
                    rank_absolute: 2,
                    domain: "www.amazon.com",
                    title: "Sponsored Product",
                    url: "https://www.amazon.com/dp/B00AAAAAAA",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAmazonSerp({
      keyword: "alpha",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual([
      "https://api.dataforseo.com/v3/serp/amazon/organic/live/advanced",
    ]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([
      {
        keyword: "alpha",
        location_code: 2840,
        language_code: "en",
      },
    ]);
    // All item types are returned (feature mappers filter to amazon_organic),
    // with rank/title/url/price/rating preserved.
    expect(result.data[0]).toMatchObject({
      type: "amazon_organic",
      rank_absolute: 1,
      domain: "www.amazon.com",
      title: "Example Product",
      url: "https://www.amazon.com/dp/B07G82D89J",
      price_from: 49.98,
      currency: "USD",
      rating: { value: 4.6, votes_count: 12345, rating_max: 5 },
      is_amazon_choice: true,
      data_asin: "B07G82D89J",
    });
    expect(result.billing).toEqual({
      path: ["v3", "serp", "amazon", "organic", "live", "advanced"],
      costUsd: 0.002,
    });
  });

  it("surfaces a charged failed task through the billing envelope", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-amazon",
            status_code: 40501,
            status_message: "Invalid Field: 'location_code'.",
            cost: 0.002,
            path: ["v3", "serp", "amazon", "organic", "live", "advanced"],
            data: { location_code: 999999 },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchAmazonSerp({
        keyword: "alpha",
        locationCode: 999999,
        languageCode: "en",
      }),
    ).rejects.toThrow(/Invalid Field/);
  });
});

describe("rank check task queue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts queued tasks, maps ids by tag, and sums cost over all entries", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-a",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw-1:desktop" },
          },
          {
            id: "task-b",
            status_code: 20100,
            cost: 0.0006,
            data: { tag: "kw-1:mobile" },
          },
          {
            id: "task-c",
            status_code: 40006,
            status_message: "Task Limit Exceeded",
            cost: 0.0006,
            data: { tag: "kw-2:desktop" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postRankCheckTasks({
      tasks: [
        { keyword: "alpha", keywordId: "kw-1", device: "desktop" },
        { keyword: "alpha", keywordId: "kw-1", device: "mobile" },
        { keyword: "beta", keywordId: "kw-2", device: "desktop" },
      ],
      locationCode: 2840,
      languageCode: "en",
      depth: 20,
      targetDomain: "example.com",
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual(["https://api.dataforseo.com/v3/serp/google/organic/task_post"]);

    // Every posted task asks DataForSEO to stop crawling at the target's
    // organic listing — that is what cuts the actual crawl cost for ranking
    // domains without false "not ranking" stops on sitelinks/PAA mentions.
    const stopCrawl = {
      stop_crawl_on_match: [
        { match_value: "example.com", match_type: "with_subdomains" },
      ],
      find_targets_in: ["organic"],
    };
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([stopCrawl, stopCrawl, stopCrawl]);
    expect(result.data).toEqual([
      {
        keyword: "alpha",
        keywordId: "kw-1",
        device: "desktop",
        taskId: "task-a",
      },
      {
        keyword: "alpha",
        keywordId: "kw-1",
        device: "mobile",
        taskId: "task-b",
      },
    ]);
    // The rejected entry's cost is still metered: a charge is a charge.
    expect(result.billing.costUsd).toBeCloseTo(0.0018, 10);
    expect(result.billing.path).toEqual([
      "v3",
      "serp",
      "google",
      "organic",
      "task_post",
    ]);
  });

  it("reports a queued task still in progress as pending", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [{ id: "task-a", status_code: 40602 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchRankCheckTaskResult({
      taskId: "task-a",
      keywordId: "kw-1",
      keyword: "alpha",
      targetDomain: "example.com",
    });

    expect(outcome).toEqual({ status: "pending" });
  });

  it("parses a completed queued task into a rank check result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-a",
            status_code: 20000,
            cost: 0,
            path: ["v3", "serp", "google", "organic", "task_get", "advanced"],
            result: [
              {
                items: [
                  {
                    type: "organic",
                    rank_group: 3,
                    rank_absolute: 4,
                    domain: "www.example.com",
                    url: "https://www.example.com/page",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await fetchRankCheckTaskResult({
      taskId: "task-a",
      keywordId: "kw-1",
      keyword: "alpha",
      targetDomain: "example.com",
    });

    expect(outcome).toEqual({
      status: "completed",
      result: {
        keywordId: "kw-1",
        keyword: "alpha",
        position: 4,
        url: "https://www.example.com/page",
        serpFeatures: ["organic"],
      },
    });
  });
});
