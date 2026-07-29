import { z } from "zod";
import { ContentAnalysisSearchLiveRequestInfo } from "dataforseo-client";
import { contentAnalysisApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  parseTaskTotalCount,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

// ---------------------------------------------------------------------------
// Content Analysis Search (/v3/content_analysis/search/live)
// Keyword-based search over DataForSEO's indexed web content. Item shape
// verified against the docs example response (2026-07-29); only the fields the
// product reads are guarded, everything else passes through.
// ---------------------------------------------------------------------------

const socialMetricSchema = z
  .object({
    type: z.string().nullable().optional(),
    like_count: z.number().nullable().optional(),
  })
  .passthrough();

const connotationTypesSchema = z
  .object({
    positive: z.number().nullable().optional(),
    negative: z.number().nullable().optional(),
    neutral: z.number().nullable().optional(),
  })
  .passthrough();

const contentInfoSchema = z
  .object({
    title: z.string().nullable().optional(),
    main_title: z.string().nullable().optional(),
    snippet: z.string().nullable().optional(),
    content_quality_score: z.number().nullable().optional(),
    connotation_types: connotationTypesSchema.nullable().optional(),
  })
  .passthrough();

const contentAnalysisSearchItemSchema = z
  .object({
    type: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    main_domain: z.string().nullable().optional(),
    score: z.number().nullable().optional(),
    page_types: z.array(z.string()).nullable().optional(),
    social_metrics: z.array(socialMetricSchema).nullable().optional(),
    content_info: contentInfoSchema.nullable().optional(),
  })
  .passthrough();

export type ContentAnalysisSearchItem = z.infer<
  typeof contentAnalysisSearchItemSchema
>;

export type ContentAnalysisSearchResult = {
  items: ContentAnalysisSearchItem[];
  totalCount: number | null;
};

type ContentAnalysisSearchInput = {
  keyword: string;
  limit?: number;
};

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export async function fetchContentAnalysisSearch(
  input: ContentAnalysisSearchInput,
  apiKey?: string,
): Promise<DataforseoApiResponse<ContentAnalysisSearchResult>> {
  const response = await contentAnalysisApi(undefined, apiKey).searchLive([
    new ContentAnalysisSearchLiveRequestInfo({
      keyword: input.keyword,
      // as_is returns every citation of the keyword; one_per_domain would
      // collapse the result set the explorer table is meant to survey.
      search_mode: "as_is",
      limit: clampLimit(input.limit ?? 25, 1, 100),
    }),
  ]);
  const task = assertOk(response);
  return {
    data: {
      items: parseTaskItems(
        "content-analysis-search-live",
        task,
        contentAnalysisSearchItemSchema,
      ),
      totalCount: parseTaskTotalCount(task),
    },
    billing: buildTaskBilling(task),
  };
}
