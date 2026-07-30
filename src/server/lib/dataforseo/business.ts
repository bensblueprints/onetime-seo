import { z } from "zod";
import {
  BusinessDataBusinessListingsSearchLiveRequestInfo,
  BusinessDataGoogleQuestionsAndAnswersLiveRequestInfo,
  type BusinessDataBusinessListingsSearchLiveItem,
} from "dataforseo-client";
import {
  businessDataApi,
  postDataforseoTasks,
} from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

type BusinessListingItem = BusinessDataBusinessListingsSearchLiveItem;

export async function fetchBusinessListingsSearch(
  input: {
    categories?: string[];
    title?: string;
    locationCoordinate: string;
    orderBy?: string[];
    limit: number;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<BusinessListingItem[]>> {
  const response = await businessDataApi(apiKey).businessListingsSearchLive([
    new BusinessDataBusinessListingsSearchLiveRequestInfo({
      categories: input.categories,
      title: input.title,
      location_coordinate: input.locationCoordinate,
      order_by: input.orderBy,
      limit: input.limit,
    }),
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}

// Q&A results carry both answered (`items`) and unanswered
// (`items_without_answers`) rows; the SDK types this result as `any`, so we
// validate a generic record shape and flatten both.
const questionsResultSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    items_without_answers: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .optional(),
  })
  .passthrough();

function combinedQuestionItems(results: unknown): Record<string, unknown>[] {
  const list = Array.isArray(results) ? results : [];
  return list.flatMap((result) => {
    const parsed = questionsResultSchema.safeParse(result ?? {});
    if (!parsed.success) return [];
    return [
      ...(parsed.data.items ?? []),
      ...(parsed.data.items_without_answers ?? []),
    ];
  });
}

export async function fetchQuestionsAnswers(
  input: {
    keyword: string;
    locationCoordinate: string;
    languageCode: string;
    depth: number;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const response = await businessDataApi(apiKey).googleQuestionsAndAnswersLive([
    new BusinessDataGoogleQuestionsAndAnswersLiveRequestInfo({
      keyword: input.keyword,
      location_coordinate: input.locationCoordinate,
      language_code: input.languageCode,
      depth: input.depth,
    }),
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: combinedQuestionItems(task.result),
    billing: buildTaskBilling(task),
  };
}

// ---------------------------------------------------------------------------
// Google Business Reviews (/v3/business_data/google/reviews/live)
// Recent reviews for a local establishment by business name + location. The
// installed SDK (2.0.19) models only the reviews task_post/task_get queue, so
// the live call goes through postDataforseoTasks — the same authenticated
// fetch, retries, and HTTP error mapping as every other DataForSEO call (same
// pattern as the YouTube/Amazon SERP fetchers in serp.ts). Item shape verified
// against the docs + the SDK's GoogleReviewsSearch model (2026-07-30); only
// the fields the product reads are guarded, everything else passes through.
// ---------------------------------------------------------------------------

const ratingSchema = z
  .object({
    value: z.number().nullable().optional(),
    votes_count: z.number().nullable().optional(),
    votes_max: z.number().nullable().optional(),
  })
  .passthrough();

const businessReviewItemSchema = z
  .object({
    type: z.string().nullable().optional(),
    review_id: z.string().nullable().optional(),
    review_text: z.string().nullable().optional(),
    time_ago: z.string().nullable().optional(),
    timestamp: z.string().nullable().optional(),
    rating: ratingSchema.nullable().optional(),
    profile_name: z.string().nullable().optional(),
    profile_url: z.string().nullable().optional(),
    review_url: z.string().nullable().optional(),
    owner_answer: z.string().nullable().optional(),
    owner_timestamp: z.string().nullable().optional(),
  })
  .passthrough();

export type BusinessReviewItem = z.infer<typeof businessReviewItemSchema>;

// Business-level metadata on result[0] (title / rating / reviews_count). A
// nice-to-have alongside the review items, so a malformed payload degrades to
// nulls instead of failing the call — parseTaskItems guards the items.
const reviewsResultMetaSchema = z
  .object({
    title: z.string().nullable().optional(),
    rating: ratingSchema.nullable().optional(),
    reviews_count: z.number().nullable().optional(),
  })
  .passthrough();

export type BusinessReviewsResult = {
  businessTitle: string | null;
  businessRating: number | null;
  reviewsCount: number | null;
  items: BusinessReviewItem[];
};

/**
 * DataForSEO bills reviews per block of 10 and processes ten in a row, so a
 * depth of 11 costs the same as 20 while returning 11 — round UP to the next
 * block so the customer gets what they pay for. Live depth caps at 100 for
 * the card (max 4490 upstream, but that's a crawl, not a glance).
 */
function clampReviewDepth(depth: number): number {
  const clamped = Math.min(100, Math.max(10, Math.floor(depth)));
  return Math.ceil(clamped / 10) * 10;
}

export async function fetchBusinessReviews(
  input: {
    keyword: string;
    locationCode: number;
    languageCode: string;
    depth?: number;
    sortBy?: "newest" | "highest_rating" | "lowest_rating" | "relevant";
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<BusinessReviewsResult>> {
  const response = (await postDataforseoTasks(
    "/v3/business_data/google/reviews/live",
    [
      {
        keyword: input.keyword,
        location_code: input.locationCode,
        language_code: input.languageCode,
        depth: clampReviewDepth(input.depth ?? 10),
        sort_by: input.sortBy ?? "newest",
      },
    ],
    apiKey,
  )) as {
    status_code?: number;
    status_message?: string;
    tasks?: DataforseoTaskLike[];
  } | null;
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses — DataForSEO still charges for it, so treat it as an empty
  // success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const meta = reviewsResultMetaSchema.safeParse(task.result?.[0] ?? {});
  return {
    data: {
      businessTitle: meta.success ? (meta.data.title ?? null) : null,
      businessRating: meta.success ? (meta.data.rating?.value ?? null) : null,
      reviewsCount: meta.success ? (meta.data.reviews_count ?? null) : null,
      items: parseTaskItems(
        "google-reviews-live",
        task,
        businessReviewItemSchema,
      ),
    },
    billing: buildTaskBilling(task),
  };
}
