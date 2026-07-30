import { waitUntil } from "cloudflare:workers";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { getKeywordsPage } from "@/server/features/domain/services/domainKeywordsPage";
import { getPagesPage } from "@/server/features/domain/services/domainPagesPage";

// Lets a caller attribute spend to its own feature (e.g. onboarding). Applied
// to the DataForSEO call, not the cache key, so cached results are shared
// across callers.
type MeteringOverrides = {
  creditFeature?: CreditFeature;
};

/** Domain overview data is refreshed every 12 hours. */
const DOMAIN_OVERVIEW_TTL_SECONDS = 12 * 60 * 60;

const domainOverviewResultSchema = z.object({
  domain: z.string(),
  organicTraffic: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  hasData: z.boolean(),
  fetchedAt: z.string(),
});

type DomainOverviewResult = z.infer<typeof domainOverviewResultSchema>;

const domainWhoisTechResultSchema = z.object({
  domain: z.string(),
  whois: z
    .object({
      registrar: z.string().nullable(),
      createdDatetime: z.string().nullable(),
      changedDatetime: z.string().nullable(),
      expirationDatetime: z.string().nullable(),
      updatedDatetime: z.string().nullable(),
      eppStatusCodes: z.array(z.string()),
      registered: z.boolean().nullable(),
      tld: z.string().nullable(),
    })
    .nullable(),
  contacts: z.object({
    emails: z.array(z.string()),
    phoneNumbers: z.array(z.string()),
  }),
  technologies: z.array(z.string()),
  fetchedAt: z.string(),
});

export type DomainWhoisTechResult = z.infer<typeof domainWhoisTechResultSchema>;

/** Flattens the group -> category -> names technologies map into a deduped
 * chip list, preserving first-seen order. */
function flattenTechnologies(
  technologies: Record<string, Record<string, string[]>> | null | undefined,
): string[] {
  if (!technologies) return [];
  const seen = new Set<string>();
  const flat: string[] = [];
  for (const categories of Object.values(technologies)) {
    for (const names of Object.values(categories)) {
      for (const name of names) {
        if (!seen.has(name)) {
          seen.add(name);
          flat.push(name);
        }
      }
    }
  }
  return flat;
}

async function getOverview(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<DomainOverviewResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);

  const cacheKey = await buildCacheKey("domain:overview", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainOverviewResultSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.hasData) {
    return cached.data;
  }

  const nowIso = new Date().toISOString();
  const dataforseo = await createDataforseoClient(billingCustomer);

  const metricsResponse = await dataforseo.domain.rankOverview({
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    ...metering,
  });

  const metrics = metricsResponse[0];

  const organicTraffic =
    metrics?.metrics?.organic?.etv != null
      ? Math.round(metrics.metrics.organic.etv)
      : null;
  const organicKeywords =
    metrics?.metrics?.organic?.count != null
      ? Math.round(metrics.metrics.organic.count)
      : null;

  const result: DomainOverviewResult = {
    domain,
    organicTraffic,
    organicKeywords,
    backlinks: null,
    referringDomains: null,
    hasData: organicKeywords != null && organicKeywords > 0,
    fetchedAt: nowIso,
  };

  if (result.hasData) {
    // waitUntil, not void: workerd cancels unregistered pending I/O once the
    // response is sent, so a fire-and-forget put never persists the cache.
    waitUntil(
      setCached(cacheKey, result, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
        (error) => {
          console.error("domain.overview.cache-write failed:", error);
        },
      ),
    );
  }

  return result;
}

async function getSuggestedKeywords(
  input: {
    domain: string;
    locationCode: number;
    languageCode: string;
    organizationId: string;
    projectId: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<
  Array<{
    keyword: string;
    position: number | null;
    searchVolume: number | null;
    traffic: number | null;
    cpc: number | null;
    keywordDifficulty: number | null;
  }>
> {
  const domain = normalizeDomainInput(input.domain, true);

  const cacheKey = await buildCacheKey("domain:keyword-suggestions", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = z
    .array(
      z.object({
        keyword: z.string(),
        position: z.number().nullable(),
        searchVolume: z.number().nullable(),
        traffic: z.number().nullable(),
        cpc: z.number().nullable(),
        keywordDifficulty: z.number().nullable(),
      }),
    )
    .safeParse(cachedRaw);
  if (cached.success && cached.data.length > 0) {
    return cached.data;
  }

  const dataforseo = await createDataforseoClient(billingCustomer);

  const rankedKeywordsResponse = await dataforseo.domain.rankedKeywords({
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: 100,
    orderBy: ["ranked_serp_element.serp_item.etv,desc"],
    ...metering,
  });

  const keywords = rankedKeywordsResponse.items
    .map((item) => mapKeywordItem(item))
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        item != null,
    )
    .map((item) => ({
      keyword: item.keyword,
      position: item.position,
      searchVolume: item.searchVolume,
      traffic: item.traffic,
      cpc: item.cpc,
      keywordDifficulty: item.keywordDifficulty,
    }));

  if (keywords.length > 0) {
    waitUntil(
      setCached(cacheKey, keywords, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
        (error) => {
          console.error(
            "domain.keyword-suggestions.cache-write failed:",
            error,
          );
        },
      ),
    );
  }

  return keywords;
}

async function getWhoisTechnologies(
  input: {
    projectId: string;
    domain: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<DomainWhoisTechResult> {
  // WHOIS records live on the registrable domain, not a subdomain host.
  const domain = normalizeDomainInput(input.domain, false);

  const cacheKey = await buildCacheKey("domain:whois-tech", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainWhoisTechResultSchema.safeParse(cachedRaw);
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = await createDataforseoClient(billingCustomer);

  const [whoisItems, technologiesResult] = await Promise.all([
    dataforseo.domainAnalytics.whoisOverview({ target: domain, ...metering }),
    dataforseo.domainAnalytics.technologies({ target: domain, ...metering }),
  ]);

  const whoisItem = whoisItems[0] ?? null;

  const result: DomainWhoisTechResult = {
    domain,
    whois: whoisItem
      ? {
          registrar: whoisItem.registrar ?? null,
          createdDatetime: whoisItem.created_datetime ?? null,
          changedDatetime: whoisItem.changed_datetime ?? null,
          expirationDatetime: whoisItem.expiration_datetime ?? null,
          updatedDatetime: whoisItem.updated_datetime ?? null,
          eppStatusCodes: whoisItem.epp_status_codes ?? [],
          registered: whoisItem.registered ?? null,
          tld: whoisItem.tld ?? null,
        }
      : null,
    contacts: {
      emails: technologiesResult?.emails ?? [],
      phoneNumbers: technologiesResult?.phone_numbers ?? [],
    },
    technologies: flattenTechnologies(technologiesResult?.technologies),
    fetchedAt: new Date().toISOString(),
  };

  if (result.whois !== null || result.technologies.length > 0) {
    waitUntil(
      setCached(cacheKey, result, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
        (error) => {
          console.error("domain.whois-tech.cache-write failed:", error);
        },
      ),
    );
  }

  return result;
}

export const DomainService = {
  getOverview,
  getSuggestedKeywords,
  getKeywordsPage,
  getPagesPage,
  getWhoisTechnologies,
} as const;
