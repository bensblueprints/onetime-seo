import { z } from "zod";
import {
  SerpApiStopCrawlOnMatchInfo,
  SerpBingOrganicLiveAdvancedRequestInfo,
  SerpGoogleLocalFinderLiveAdvancedRequestInfo,
  SerpGoogleMapsLiveAdvancedRequestInfo,
  SerpGoogleOrganicLiveAdvancedRequestInfo,
  SerpGoogleOrganicTaskPostRequestInfo,
} from "dataforseo-client";
import { postDataforseoTasks, serpApi } from "@/server/lib/dataforseo/core";
import { MAX_TASKS_PER_POST } from "@/server/lib/dataforseo/shared";
import {
  assertOk,
  buildTaskBilling,
  isNoResultsTask,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

/** DataForSEO bills SERPs in pages of 10; depth outside 10-100 is rejected. */
function clampSerpDepth(depth: number): number {
  return Math.min(100, Math.max(10, depth));
}

/**
 * Stop crawling SERP pages once the target domain is found — DataForSEO only
 * bills the pages crawled, so a page-1 ranking at depth 20 costs one page
 * instead of two. Matching is restricted to organic results and uses
 * with_subdomains, mirroring buildRankCheckResult exactly: without
 * find_targets_in, a sitelink or PAA mention could stop the crawl before the
 * domain's organic listing and record a false "not ranking".
 */
function stopCrawlOnTarget(targetDomain: string) {
  return {
    stop_crawl_on_match: [
      new SerpApiStopCrawlOnMatchInfo({
        match_value: targetDomain,
        match_type: "with_subdomains",
      }),
    ],
    find_targets_in: ["organic"],
  };
}

// Kept as a hand-written schema: the SDK's BaseSerpApiElementItem type omits
// etv / estimated_paid_traffic_cost / backlinks_info / rank_changes, which we
// rely on. The fields survive deserialization (the SDK copies unknown keys), so
// validating here is both our type-safety guard and how we read those fields.
const serpSnapshotItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    breadcrumb: z.string().nullable().optional(),
    etv: z.number().nullable().optional(),
    estimated_paid_traffic_cost: z.number().nullable().optional(),
    backlinks_info: z
      .object({
        referring_domains: z.number().nullable().optional(),
        backlinks: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    rank_changes: z
      .object({
        previous_rank_absolute: z.number().nullable().optional(),
        is_new: z.boolean().nullable().optional(),
        is_up: z.boolean().nullable().optional(),
        is_down: z.boolean().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type SerpLiveItem = z.infer<typeof serpSnapshotItemSchema>;

export async function fetchLiveSerp(
  input: {
    keyword: string;
    locationCode: number;
    languageCode: string;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<SerpLiveItem[]>> {
  const response = await serpApi(apiKey).googleOrganicLiveAdvanced([
    new SerpGoogleOrganicLiveAdvancedRequestInfo({
      keyword: input.keyword,
      location_code: input.locationCode,
      language_code: input.languageCode,
      device: "desktop",
      os: "windows",
      depth: 100,
    }),
  ]);
  const task = assertOk(response);
  return {
    data: parseTaskItems(
      "google-organic-live-advanced",
      task,
      serpSnapshotItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

/**
 * Bing organic SERP (live/advanced). Bing's organic items carry the same
 * type/rank/domain/title/url/description shape as Google's, so the Google
 * snapshot schema doubles as the type-safety guard here.
 */
export async function fetchBingSerp(
  input: {
    keyword: string;
    locationCode: number;
    languageCode: string;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<SerpLiveItem[]>> {
  const response = await serpApi(apiKey).bingOrganicLiveAdvanced([
    new SerpBingOrganicLiveAdvancedRequestInfo({
      keyword: input.keyword,
      location_code: input.locationCode,
      language_code: input.languageCode,
      device: "desktop",
      os: "windows",
      depth: 100,
    }),
  ]);
  const task = assertOk(response);
  return {
    data: parseTaskItems(
      "bing-organic-live-advanced",
      task,
      serpSnapshotItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

// Hand-written schema (same rationale as serpSnapshotItemSchema): the
// installed SDK (2.0.19) has no YouTube organic models, so this is both the
// type-safety guard and how we read video/channel fields. Items are
// youtube_video / youtube_channel / youtube_playlist; channels use `name`
// instead of `title` and have no video_id.
const youtubeSerpItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    title: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    video_id: z.string().nullable().optional(),
    channel_id: z.string().nullable().optional(),
    channel_name: z.string().nullable().optional(),
    channel_url: z.string().nullable().optional(),
  })
  .passthrough();

export type YoutubeSerpItem = z.infer<typeof youtubeSerpItemSchema>;

/**
 * YouTube organic SERP (live/advanced). The SDK doesn't model this endpoint,
 * so the request goes through postDataforseoTasks — the same authenticated
 * fetch, retries, and HTTP error mapping as every other DataForSEO call.
 */
export async function fetchYoutubeSerp(
  input: {
    keyword: string;
    locationCode: number;
    languageCode: string;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<YoutubeSerpItem[]>> {
  const response = (await postDataforseoTasks(
    "/v3/serp/youtube/organic/live/advanced",
    [
      {
        keyword: input.keyword,
        location_code: input.locationCode,
        language_code: input.languageCode,
        device: "desktop",
        os: "windows",
      },
    ],
    apiKey,
  )) as {
    status_code?: number;
    status_message?: string;
    tasks?: DataforseoTaskLike[];
  } | null;
  const task = assertOk(response);
  return {
    data: parseTaskItems(
      "youtube-organic-live-advanced",
      task,
      youtubeSerpItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

// Hand-written schema (same rationale as serpSnapshotItemSchema): the
// installed SDK (2.0.19) has no Amazon organic SERP models (its
// AmazonSerpElement covers the Labs endpoints only), so this is both the
// type-safety guard and how we read product fields. Items are amazon_organic /
// amazon_paid; price is a range (price_from/price_to) and rating carries
// value + votes_count (reviews).
const amazonSerpItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
    price_from: z.number().nullable().optional(),
    price_to: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
    rating: z
      .object({
        value: z.number().nullable().optional(),
        votes_count: z.number().nullable().optional(),
        rating_max: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    is_amazon_choice: z.boolean().nullable().optional(),
    is_best_seller: z.boolean().nullable().optional(),
    data_asin: z.string().nullable().optional(),
  })
  .passthrough();

export type AmazonSerpItem = z.infer<typeof amazonSerpItemSchema>;

/**
 * Amazon organic SERP (live/advanced). The SDK doesn't model this endpoint,
 * so the request goes through postDataforseoTasks — the same authenticated
 * fetch, retries, and HTTP error mapping as every other DataForSEO call.
 */
export async function fetchAmazonSerp(
  input: {
    keyword: string;
    locationCode: number;
    languageCode: string;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<AmazonSerpItem[]>> {
  const response = (await postDataforseoTasks(
    "/v3/serp/amazon/organic/live/advanced",
    [
      {
        keyword: input.keyword,
        location_code: input.locationCode,
        language_code: input.languageCode,
      },
    ],
    apiKey,
  )) as {
    status_code?: number;
    status_message?: string;
    tasks?: DataforseoTaskLike[];
  } | null;
  const task = assertOk(response);
  return {
    data: parseTaskItems(
      "amazon-organic-live-advanced",
      task,
      amazonSerpItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

export interface RankCheckResult {
  keywordId: string;
  keyword: string;
  position: number | null;
  url: string | null;
  serpFeatures: string[];
}

function buildRankCheckResult(
  input: { keywordId: string; keyword: string; targetDomain: string },
  items: SerpLiveItem[],
): RankCheckResult {
  const target = input.targetDomain.toLowerCase();
  const organicMatch = items.find((item) => {
    if (item.type !== "organic" || item.domain == null) return false;
    const domain = item.domain.toLowerCase();
    return domain === target || domain.endsWith(`.${target}`);
  });

  return {
    keywordId: input.keywordId,
    keyword: input.keyword,
    position: organicMatch
      ? (organicMatch.rank_absolute ?? organicMatch.rank_group ?? null)
      : null,
    url: organicMatch?.url ?? null,
    serpFeatures: [...new Set(items.map((item) => item.type).filter(Boolean))],
  };
}

export async function fetchRankCheckSerp(
  input: {
    keyword: string;
    keywordId: string;
    locationCode: number;
    languageCode: string;
    locationName?: string;
    device: "desktop" | "mobile";
    targetDomain: string;
    depth: number;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<RankCheckResult>> {
  const depth = clampSerpDepth(input.depth);
  const locationParams = input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
  const response = await serpApi(apiKey).googleOrganicLiveAdvanced([
    new SerpGoogleOrganicLiveAdvancedRequestInfo({
      keyword: input.keyword,
      ...locationParams,
      language_code: input.languageCode,
      device: input.device,
      os: input.device === "desktop" ? "windows" : "android",
      depth,
      ...stopCrawlOnTarget(input.targetDomain),
    }),
  ]);

  // "No Search Results" (40501) is valid for obscure/new keywords — treat as an
  // empty result set rather than failing the whole rank-tracking run.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = parseTaskItems(
    "google-organic-live-advanced",
    task,
    serpSnapshotItemSchema,
  );

  return {
    data: buildRankCheckResult(input, items),
    billing: buildTaskBilling(task),
  };
}

// ---------------------------------------------------------------------------
// Task-queue rank checks (scheduled runs). DataForSEO's standard queue costs
// ~30% of the live endpoint; tasks complete in ~5 minutes on average. The flow
// is task_post (charged) -> poll task_get (free) -> live fallback for
// stragglers, orchestrated by the rank check workflow.
// ---------------------------------------------------------------------------

export interface RankCheckTaskInput {
  keyword: string;
  keywordId: string;
  device: "desktop" | "mobile";
}

export interface PostedRankCheckTask extends RankCheckTaskInput {
  taskId: string;
}

export async function postRankCheckTasks(
  input: {
    tasks: RankCheckTaskInput[];
    locationCode: number;
    languageCode: string;
    locationName?: string;
    depth: number;
    targetDomain: string;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<PostedRankCheckTask[]>> {
  if (input.tasks.length === 0 || input.tasks.length > MAX_TASKS_PER_POST) {
    throw new AppError(
      "INTERNAL_ERROR",
      `task_post accepts 1-${MAX_TASKS_PER_POST} tasks, got ${input.tasks.length}`,
    );
  }
  const depth = clampSerpDepth(input.depth);
  const locationParams = input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
  const response = await serpApi(apiKey).googleOrganicTaskPost(
    input.tasks.map(
      (task) =>
        new SerpGoogleOrganicTaskPostRequestInfo({
          keyword: task.keyword,
          ...locationParams,
          language_code: input.languageCode,
          device: task.device,
          os: task.device === "desktop" ? "windows" : "android",
          depth,
          // Queued tasks are billed provisionally at full depth at post time;
          // task_get later reports the reduced actual cost when the crawl
          // stopped early. We meter customers on the post-time amount —
          // collection-time metering is a possible future optimization.
          ...stopCrawlOnTarget(input.targetDomain),
          // Echoed back on the response entry and task_get; used to map a
          // DataForSEO task id back to our keyword without relying on order.
          tag: `${task.keywordId}:${task.device}`,
        }),
    ),
  );

  if (!response || response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_post failed",
    );
  }

  // One response entry per submitted task; accepted entries have status 20100
  // "Task Created" and their own cost (charged at post time). Cost is summed
  // over every entry — accepted or not — so anything DataForSEO charged is
  // metered. Rejected entries get no posted task; the workflow falls back to
  // the live endpoint for any keyword/device pair missing from the result.
  const byTag = new Map(
    input.tasks.map((task) => [`${task.keywordId}:${task.device}`, task]),
  );
  const posted: PostedRankCheckTask[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    const tag: unknown = entry.data?.tag;
    const task = typeof tag === "string" ? byTag.get(tag) : undefined;
    if (entry.status_code !== 20100 || !entry.id || !task) {
      console.warn(
        `dataforseo.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
      continue;
    }
    posted.push({ ...task, taskId: entry.id });
  }

  return {
    data: posted,
    billing: {
      path: ["v3", "serp", "google", "organic", "task_post"],
      costUsd,
    },
  };
}

type RankCheckTaskOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | { status: "completed"; result: RankCheckResult };

// Task lifecycle codes meaning "not done yet": Task Created / Task Handed /
// Task In Queue.
const TASK_IN_PROGRESS_STATUS_CODES = new Set([20100, 40601, 40602]);

/**
 * Collect one queued task's result. Deliberately not metered and not wrapped
 * in the billing envelope: collection is free (the task was charged at
 * task_post), and the task_get response carries the task's settled cost
 * (reduced when stop_crawl_on_match ended the crawl early) — running it
 * through the metering seam would charge the customer twice.
 */
export async function fetchRankCheckTaskResult(
  input: {
    taskId: string;
    keywordId: string;
    keyword: string;
    targetDomain: string;
  },
  apiKey?: string,
): Promise<RankCheckTaskOutcome> {
  const response = await serpApi(apiKey).googleOrganicTaskGetAdvanced(
    input.taskId,
  );
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_get failed",
    );
  }

  if (
    task.status_code !== undefined &&
    TASK_IN_PROGRESS_STATUS_CODES.has(task.status_code)
  ) {
    return { status: "pending" };
  }

  if (task.status_code !== 20000) {
    // "No Search Results" is valid for obscure/new keywords — same treatment
    // as the live path's treatNoResultsAsEmpty.
    if (!isNoResultsTask(task)) {
      return {
        status: "failed",
        message:
          task.status_message || `DataForSEO task failed (${task.status_code})`,
      };
    }
    return {
      status: "completed",
      result: buildRankCheckResult(input, []),
    };
  }

  const items = parseTaskItems(
    "google-organic-task-get-advanced",
    task,
    serpSnapshotItemSchema,
  );
  return { status: "completed", result: buildRankCheckResult(input, items) };
}

export async function fetchLocalSerp(
  input: {
    keyword: string;
    locationCoordinate?: string;
    languageCode: string;
    searchType: "maps" | "local_finder";
    device: "desktop" | "mobile";
    depth: number;
    searchPlaces?: boolean;
  },
  apiKey?: string,
): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const os = input.device === "desktop" ? "windows" : "android";

  // Maps and Local Finder return different SDK item models; both carry an index
  // signature, so the typed items assign cleanly to the generic row shape.
  if (input.searchType === "maps") {
    const response = await serpApi(apiKey).googleMapsLiveAdvanced([
      new SerpGoogleMapsLiveAdvancedRequestInfo({
        keyword: input.keyword,
        location_coordinate: input.locationCoordinate,
        language_code: input.languageCode,
        device: input.device,
        os,
        depth: input.depth,
        search_places: input.searchPlaces,
      }),
    ]);
    const task = assertOk(response);
    return {
      data: task.result?.[0]?.items ?? [],
      billing: buildTaskBilling(task),
    };
  }

  const response = await serpApi(apiKey).googleLocalFinderLiveAdvanced([
    new SerpGoogleLocalFinderLiveAdvancedRequestInfo({
      keyword: input.keyword,
      location_coordinate: input.locationCoordinate,
      language_code: input.languageCode,
      device: input.device,
      os,
      depth: input.depth,
    }),
  ]);
  const task = assertOk(response);
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}
