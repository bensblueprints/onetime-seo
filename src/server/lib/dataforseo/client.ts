import {
  type CreditFeature,
  mapDataforseoPathToCreditFeature,
} from "@/shared/billing-credit-features";
import {
  assertUsageCreditsAvailable,
  getOrCreateOrganizationCustomer,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import type { BillingCustomerContext } from "@/server/billing/subscription";
// Type-only namespace import: erased at compile, so the section modules (and
// the SDK they pull in) still only load through loadDataforseoSections below.
import type * as sections from "@/server/lib/dataforseo/sections";
import {
  DataforseoChargedTaskError,
  type DataforseoApiCallCost,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";

export { mapDataforseoPathToCreditFeature };

/** The section-fetcher barrel (sections.ts), as a type for `meter` pickers. */
export type DataforseoSections = typeof sections;

let sectionsPromise: Promise<DataforseoSections> | undefined;

/** Single lazy boundary for the DataForSEO subtree: the section fetchers and
 * the ~3 MB dataforseo-client SDK they statically import stay out of the
 * eager isolate startup graph and load once, on the first API call. */
export function loadDataforseoSections(): Promise<DataforseoSections> {
  return (sectionsPromise ??= import("@/server/lib/dataforseo/sections"));
}

/**
 * Wraps a section fetcher with billing metering. Each entry on the client is
 * `meter(customer, (s) => s.fetchX, defaultFeature?)`, which returns a function
 * with the fetcher's own input type and resolves to its unwrapped `.data`. The
 * picker indirection (rather than the fetcher itself) keeps the section
 * modules behind loadDataforseoSections.
 *
 * `defaultFeature` is the fallback credit feature; a caller can override it per
 * call by passing `creditFeature` in the input (e.g. an MCP tool attributing
 * spend to its own feature). The extra field is ignored by the fetchers, which
 * read named fields rather than spreading the input.
 *
 * `apiKey` is the caller's resolved DataForSEO key (per-org, or the env
 * fallback); it is forwarded to the fetcher, which passes it to its section
 * API factory.
 */
function meter<I, T>(
  customer: BillingCustomerContext,
  pick: (
    sections: DataforseoSections,
  ) => (input: I, apiKey?: string) => Promise<DataforseoApiResponse<T>>,
  defaultFeature?: CreditFeature,
  apiKey?: string,
): (input: I & { creditFeature?: CreditFeature }) => Promise<T> {
  return (input) =>
    meterDataforseoCall(
      customer,
      async () => pick(await loadDataforseoSections())(input, apiKey),
      input.creditFeature ?? defaultFeature,
    );
}

export async function createDataforseoClient(customer: BillingCustomerContext) {
  // Resolve the org's DataForSEO key once per client (org key, falling back to
  // the shared DATAFORSEO_API_KEY env var). core.ts statically imports the
  // dataforseo-client SDK, so the resolver is reached through a dynamic
  // import — a static import would drag the SDK into the eager isolate
  // startup graph (the same boundary loadDataforseoSections guards).
  const { resolveDataforseoApiKey } =
    await import("@/server/lib/dataforseo/core");
  const apiKey = await resolveDataforseoApiKey(customer.organizationId);
  // Threads the resolved key into every section fetcher (which forwards it to
  // its API factory) without re-resolving — and re-reading the DB — per call.
  const meterWithKey = <I, T>(
    pick: (
      sections: DataforseoSections,
    ) => (input: I, apiKey?: string) => Promise<DataforseoApiResponse<T>>,
    defaultFeature?: CreditFeature,
  ) => meter(customer, pick, defaultFeature, apiKey);
  return {
    business: {
      businessListings: meterWithKey(
        (s) => s.fetchBusinessListingsSearch,
        "local_seo",
      ),
      questionsAnswers: meterWithKey(
        (s) => s.fetchQuestionsAnswers,
        "local_seo",
      ),
      reviews: meterWithKey((s) => s.fetchBusinessReviews, "local_seo"),
    },
    backlinks: {
      summary: meterWithKey((s) => s.fetchBacklinksSummary),
      rows: meterWithKey((s) => s.fetchBacklinksRows),
      referringDomains: meterWithKey((s) => s.fetchReferringDomains),
      domainPages: meterWithKey((s) => s.fetchDomainPagesSummary),
      history: meterWithKey((s) => s.fetchBacklinksHistory),
    },
    keywords: {
      related: meterWithKey((s) => s.fetchRelatedKeywords),
      suggestions: meterWithKey((s) => s.fetchKeywordSuggestions),
      ideas: meterWithKey((s) => s.fetchKeywordIdeas),
      // Google Ads endpoints for countries Labs doesn't support.
      adsIdeas: meterWithKey((s) => s.fetchAdsKeywordIdeas),
      adsSearchVolume: meterWithKey((s) => s.fetchAdsSearchVolume),
    },
    domain: {
      rankOverview: meterWithKey((s) => s.fetchDomainRankOverview),
      rankedKeywords: meterWithKey((s) => s.fetchRankedKeywords),
      relevantPages: meterWithKey((s) => s.fetchRelevantPages),
    },
    domainAnalytics: {
      // Path mapping (domain_analytics -> domain_overview) attributes spend;
      // see mapDataforseoPathToCreditFeature.
      whoisOverview: meterWithKey((s) => s.fetchWhoisOverview),
      technologies: meterWithKey((s) => s.fetchDomainTechnologies),
    },
    serp: {
      live: meterWithKey((s) => s.fetchLiveSerp),
      bing: meterWithKey((s) => s.fetchBingSerp),
      youtube: meterWithKey((s) => s.fetchYoutubeSerp),
      amazon: meterWithKey((s) => s.fetchAmazonSerp),
      rankCheck: meterWithKey((s) => s.fetchRankCheckSerp, "rank_tracking"),
      // Posts up to 100 queued rank check tasks; one metered charge covers the
      // whole batch (DataForSEO bills task_post at post time, collection is
      // free).
      rankCheckTaskPost: meterWithKey(
        (s) => s.postRankCheckTasks,
        "rank_tracking",
      ),
      local: meterWithKey((s) => s.fetchLocalSerp, "local_seo"),
    },
    labs: {
      // Callers (e.g. the keyword-metrics MCP tool) can attribute the spend to
      // their own feature by passing `creditFeature` in the input; defaults to
      // rank_tracking when omitted.
      keywordOverview: meterWithKey(
        (s) => s.fetchKeywordOverview,
        "rank_tracking",
      ),
      serpCompetitors: meterWithKey((s) => s.fetchSerpCompetitors),
    },
    lighthouse: {
      live: meterWithKey((s) => s.fetchLighthouseResult),
    },
    contentAnalysis: {
      search: meterWithKey(
        (s) => s.fetchContentAnalysisSearch,
        "keyword_research",
      ),
    },
    aiSearch: {
      mentionsSearch: meterWithKey((s) => s.fetchLlmMentionsSearch),
      aggregatedMetrics: meterWithKey((s) => s.fetchLlmAggregatedMetrics),
      topPages: meterWithKey((s) => s.fetchLlmTopPages),
      crossAggregatedMetrics: meterWithKey(
        (s) => s.fetchLlmCrossAggregatedMetrics,
      ),
      llmResponse: meterWithKey((s) => s.fetchLlmResponse),
    },
  } as const;
}

async function meterDataforseoCall<T>(
  customer: BillingCustomerContext,
  execute: () => Promise<DataforseoApiResponse<T>>,
  creditFeature?: CreditFeature,
): Promise<T> {
  const isHostedMode = await isHostedServerAuthMode();

  if (!isHostedMode) {
    // Whop subscription orgs meter against their monthly credit bundle
    // (check-then-meter, mirroring the hosted Autumn path below); byok orgs
    // and non-whop modes run unmetered, exactly as before.
    if (customer.whopTier === "subscription") {
      return meterWhopSubscriptionCall(customer, execute);
    }
    const result = await execute();
    return result.data;
  }

  const billingCustomer = await getOrCreateOrganizationCustomer(customer);

  const { monthlyRemaining } = await assertUsageCreditsAvailable(
    billingCustomer.id,
  );

  let result: DataforseoApiResponse<T>;
  try {
    result = await execute();
  } catch (error) {
    if (error instanceof DataforseoChargedTaskError) {
      // A malformed request (DataForSEO "Invalid Field: ...") that DataForSEO
      // did not bill returns no value to the customer, so don't charge — surface
      // it as a non-reportable VALIDATION_ERROR. If DataForSEO still billed us
      // (costUsd > 0), fall through to the normal charge + capture path so the
      // spend stays metered and visible instead of silently eaten.
      if (error.isInvalidField && error.billing.costUsd <= 0) {
        throw new AppError("VALIDATION_ERROR", error.message);
      }
      await trackDataforseoCost({
        customer,
        customerId: billingCustomer.id,
        billing: error.billing,
        monthlyRemaining,
        creditFeature,
      });
    }
    throw error;
  }

  await trackDataforseoCost({
    customer,
    customerId: billingCustomer.id,
    billing: result.billing,
    monthlyRemaining,
    creditFeature,
  });

  return result.data;
}

/**
 * Whop subscription metering: gate on the org's credit balance BEFORE the
 * DataForSEO call (an empty balance means the call must not execute), then
 * deduct the exact marked-up cost afterwards. Charged task errors are metered
 * the same way as the hosted path — unbilled invalid-field failures stay free.
 */
async function meterWhopSubscriptionCall<T>(
  customer: BillingCustomerContext,
  execute: () => Promise<DataforseoApiResponse<T>>,
): Promise<T> {
  // Lazy import: creditsService pulls in @/db (drizzle), which must stay out
  // of the eager isolate startup graph (same boundary as the core.ts dynamic
  // import in createDataforseoClient).
  const { assertCreditsAvailable, deductCredits, creditsForRawCost } =
    await import("@/server/features/credits/creditsService");

  await assertCreditsAvailable(customer.organizationId);

  let result: DataforseoApiResponse<T>;
  try {
    result = await execute();
  } catch (error) {
    if (error instanceof DataforseoChargedTaskError) {
      if (error.isInvalidField && error.billing.costUsd <= 0) {
        throw new AppError("VALIDATION_ERROR", error.message);
      }
      await deductCredits(
        customer.organizationId,
        creditsForRawCost(error.billing.costUsd),
      );
    }
    throw error;
  }

  await deductCredits(
    customer.organizationId,
    creditsForRawCost(result.billing.costUsd),
  );
  return result.data;
}

async function trackDataforseoCost(args: {
  customer: BillingCustomerContext;
  customerId: string;
  billing: DataforseoApiCallCost;
  monthlyRemaining: number;
  creditFeature?: CreditFeature;
}) {
  await trackUsageCreditSpend({
    customer: args.customer,
    customerId: args.customerId,
    creditFeature:
      args.creditFeature ?? mapDataforseoPathToCreditFeature(args.billing.path),
    costUsd: args.billing.costUsd,
    monthlyRemaining: args.monthlyRemaining,
    properties: {
      provider: "dataforseo",
      paths: [args.billing.path.join("/")],
      fromCache: false,
    },
  });
}
