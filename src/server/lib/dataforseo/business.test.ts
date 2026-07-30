import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { fetchBusinessReviews } from "@/server/lib/dataforseo/business";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

const REVIEWS_PATH = ["v3", "business_data", "google", "reviews", "live"];

function reviewsTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-reviews",
    status_code: 20000,
    cost: 0.0015,
    path: REVIEWS_PATH,
    result: [
      {
        keyword: "hedonism wines",
        type: "google_reviews_search",
        title: "Hedonism Wines",
        rating: { value: 4.7, votes_count: 350, votes_max: 5 },
        reviews_count: 350,
        items_count: 2,
        items: [
          {
            type: "google_reviews_search",
            review_id: "abc123",
            review_text: "Incredible selection and staff.",
            time_ago: "2 days ago",
            timestamp: "2026-07-28 10:15:00 +00:00",
            rating: { value: 5, votes_count: 1, votes_max: 5 },
            profile_name: "Jane Doe",
            profile_url: "https://www.google.com/maps/contrib/123",
            review_url: "https://www.google.com/maps/reviews/abc123",
            owner_answer: "Thank you, Jane!",
            owner_timestamp: "2026-07-29 08:00:00 +00:00",
          },
          {
            type: "google_reviews_search",
            review_id: "def456",
            review_text: "Good but pricey.",
            time_ago: "a week ago",
            timestamp: "2026-07-21 14:00:00 +00:00",
            rating: { value: 4, votes_count: 1, votes_max: 5 },
            profile_name: "John Smith",
            profile_url: null,
            review_url: null,
            owner_answer: null,
            owner_timestamp: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("business reviews live", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the reviews live endpoint and parses review items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [reviewsTask()],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBusinessReviews({
      keyword: "hedonism wines",
      locationCode: 2840,
      languageCode: "en",
      depth: 10,
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual(["https://api.dataforseo.com/v3/business_data/google/reviews/live"]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toEqual([
      {
        keyword: "hedonism wines",
        location_code: 2840,
        language_code: "en",
        depth: 10,
        sort_by: "newest",
      },
    ]);

    expect(result.data.businessTitle).toBe("Hedonism Wines");
    expect(result.data.businessRating).toBe(4.7);
    expect(result.data.reviewsCount).toBe(350);
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items[0]).toMatchObject({
      review_id: "abc123",
      review_text: "Incredible selection and staff.",
      profile_name: "Jane Doe",
      rating: { value: 5 },
      owner_answer: "Thank you, Jane!",
    });
    expect(result.billing).toEqual({
      path: REVIEWS_PATH,
      costUsd: 0.0015,
    });
  });

  it("clamps depth and rounds it up to the billed block of 10", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({
            status_code: 20000,
            tasks: [reviewsTask()],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchBusinessReviews({
      keyword: "hedonism wines",
      locationCode: 2840,
      languageCode: "en",
      depth: 11,
    });
    await fetchBusinessReviews({
      keyword: "hedonism wines",
      locationCode: 2840,
      languageCode: "en",
      depth: 5000,
    });

    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([{ depth: 20 }]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[1]?.[1]),
    ).toMatchObject([{ depth: 100 }]);
  });

  it("surfaces a charged failed task through the billing envelope", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-reviews",
            status_code: 40501,
            status_message: "Invalid Field: 'keyword'.",
            cost: 0.0015,
            path: REVIEWS_PATH,
            data: { keyword: "" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchBusinessReviews({
        keyword: "",
        locationCode: 2840,
        languageCode: "en",
      }),
    ).rejects.toThrow(/Invalid Field/);
  });

  it("treats DataForSEO's no-search-results as an empty success", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-reviews",
            status_code: 40501,
            status_message: "No Search Results.",
            cost: 0.0015,
            path: REVIEWS_PATH,
            result: null,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBusinessReviews({
      keyword: "obscure business nowhere",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(result.data.items).toEqual([]);
    expect(result.data.businessTitle).toBeNull();
    expect(result.billing).toEqual({ path: REVIEWS_PATH, costUsd: 0.0015 });
  });

  it("rejects a malformed items payload instead of returning garbage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          reviewsTask({
            result: [
              {
                title: "Hedonism Wines",
                items: [
                  {
                    type: "google_reviews_search",
                    review_text: "Great.",
                    rating: { value: "not-a-number" },
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
      fetchBusinessReviews({
        keyword: "hedonism wines",
        locationCode: 2840,
        languageCode: "en",
      }),
    ).rejects.toThrow(/invalid response shape/);
  });
});
