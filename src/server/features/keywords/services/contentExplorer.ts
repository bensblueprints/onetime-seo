import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { ContentAnalysisSearchItem } from "@/server/lib/dataforseo";
import type {
  ContentExplorerItem,
  ContentExplorerResult,
  ContentExplorerSentiment,
} from "@/types/keywords";
import { normalizeKeyword } from "./research/helpers";

/**
 * Content Explorer: keyword-based search over DataForSEO's indexed web
 * content (content_analysis/search/live). One metered call per search; no
 * cache — the card is an on-demand survey, and the upstream index is large
 * enough that repeat lookups for the same keyword are rare.
 */

type Sentiment = ContentExplorerSentiment;

function pickSentiment(connotations: {
  positive?: number | null;
  negative?: number | null;
  neutral?: number | null;
} | null | undefined): ContentExplorerItem["sentiment"] {
  if (!connotations) return null;
  const entries: Array<[Sentiment, number]> = [];
  if (typeof connotations.positive === "number")
    entries.push(["positive", connotations.positive]);
  if (typeof connotations.negative === "number")
    entries.push(["negative", connotations.negative]);
  if (typeof connotations.neutral === "number")
    entries.push(["neutral", connotations.neutral]);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function sumSocialShares(
  metrics: Array<{ like_count?: number | null }> | null | undefined,
): number | null {
  if (!metrics || metrics.length === 0) return null;
  let total = 0;
  let seen = false;
  for (const metric of metrics) {
    if (typeof metric.like_count === "number") {
      total += metric.like_count;
      seen = true;
    }
  }
  return seen ? total : null;
}

function mapItem(item: ContentAnalysisSearchItem): ContentExplorerItem {
  return {
    title:
      item.content_info?.main_title ??
      item.content_info?.title ??
      item.url ??
      "",
    url: item.url ?? "",
    domain: item.main_domain ?? item.domain ?? "",
    score: item.content_info?.content_quality_score ?? null,
    sentiment: pickSentiment(item.content_info?.connotation_types),
    socialShares: sumSocialShares(item.social_metrics),
  };
}

export async function exploreContent(
  input: { projectId: string; keyword: string; limit?: number },
  billingCustomer: BillingCustomerContext,
): Promise<ContentExplorerResult> {
  const keyword = normalizeKeyword(input.keyword);
  const dataforseo = await createDataforseoClient(billingCustomer);
  const result = await dataforseo.contentAnalysis.search({
    keyword,
    limit: input.limit,
  });
  return {
    requestedKeyword: keyword,
    totalCount: result.totalCount,
    items: result.items.map(mapItem).filter((item) => item.url !== ""),
  };
}
