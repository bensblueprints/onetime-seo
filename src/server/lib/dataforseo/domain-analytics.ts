import { z } from "zod";
import {
  DomainAnalyticsTechnologiesDomainTechnologiesLiveRequestInfo,
  DomainAnalyticsWhoisOverviewLiveRequestInfo,
} from "dataforseo-client";
import { domainAnalyticsApi } from "@/server/lib/dataforseo/core";
import { AppError } from "@/server/lib/errors";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

// ---------------------------------------------------------------------------
// Domain Analytics: WHOIS overview (/v3/domain_analytics/whois/overview/live)
// and domain technologies
// (/v3/domain_analytics/technologies/domain_technologies/live). Item shapes
// verified against the docs example responses (2026-07-30); only the fields
// the product reads are guarded, everything else passes through.
// ---------------------------------------------------------------------------

const whoisOverviewItemSchema = z
  .object({
    domain: z.string().nullable().optional(),
    created_datetime: z.string().nullable().optional(),
    changed_datetime: z.string().nullable().optional(),
    expiration_datetime: z.string().nullable().optional(),
    updated_datetime: z.string().nullable().optional(),
    first_seen: z.string().nullable().optional(),
    epp_status_codes: z.array(z.string()).nullable().optional(),
    tld: z.string().nullable().optional(),
    registered: z.boolean().nullable().optional(),
    registrar: z.string().nullable().optional(),
  })
  .passthrough();

export type WhoisOverviewItem = z.infer<typeof whoisOverviewItemSchema>;

// technologies is a two-level map: group ("servers", "content", ...) ->
// category ("cdn", "cms", ...) -> detected technology names. The SDK
// deserializes it into a TechnologiesInfo class instance (every known group
// present as an own property, undefined when absent), which z.record rejects —
// copy the defined groups into a plain object before validating.
const technologiesSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null) return value;
    const plain: Record<string, unknown> = {};
    for (const [group, categories] of Object.entries(value)) {
      if (categories !== undefined) plain[group] = categories;
    }
    return plain;
  },
  z.record(z.string(), z.record(z.string(), z.array(z.string()))),
);

const domainTechnologiesResultSchema = z
  .object({
    type: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    phone_numbers: z.array(z.string()).nullable().optional(),
    emails: z.array(z.string()).nullable().optional(),
    social_graph_urls: z.array(z.string()).nullable().optional(),
    technologies: technologiesSchema.nullable().optional(),
  })
  .passthrough();

export type DomainTechnologiesResult = z.infer<
  typeof domainTechnologiesResultSchema
>;

/**
 * domain_technologies returns the single result object directly on
 * `task.result[0]` (no `items` wrapper like the list endpoints), so it needs
 * its own guard alongside parseTaskItems.
 */
function parseTaskResult<T extends z.ZodTypeAny>(
  endpoint: string,
  task: DataforseoTaskLike,
  resultSchema: T,
): z.infer<T> | null {
  const first = task.result?.[0];
  if (first == null) return null;
  const parsed = resultSchema.safeParse(first);
  if (!parsed.success) {
    console.error(
      `dataforseo.${endpoint}.invalid-payload`,
      parsed.error.issues.slice(0, 5),
    );
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${endpoint} returned an invalid response shape`,
    );
  }
  return parsed.data;
}

type DomainAnalyticsInput = {
  target: string;
};

export async function fetchWhoisOverview(
  input: DomainAnalyticsInput,
  apiKey?: string,
): Promise<DataforseoApiResponse<WhoisOverviewItem[]>> {
  const response = await domainAnalyticsApi(
    undefined,
    apiKey,
  ).whoisOverviewLive([
    new DomainAnalyticsWhoisOverviewLiveRequestInfo({
      // whois/overview is a filtered search over the WHOIS database; an exact
      // domain filter pins it to the single domain the product asks about.
      filters: [["domain", "=", input.target]],
      limit: 1,
    }),
  ]);
  const task = assertOk(response);
  return {
    data: parseTaskItems("whois-overview-live", task, whoisOverviewItemSchema),
    billing: buildTaskBilling(task),
  };
}

export async function fetchDomainTechnologies(
  input: DomainAnalyticsInput,
  apiKey?: string,
): Promise<DataforseoApiResponse<DomainTechnologiesResult | null>> {
  const response = await domainAnalyticsApi(
    undefined,
    apiKey,
  ).technologiesDomainTechnologiesLive([
    new DomainAnalyticsTechnologiesDomainTechnologiesLiveRequestInfo({
      target: input.target,
    }),
  ]);
  const task = assertOk(response);
  return {
    data: parseTaskResult(
      "domain-technologies-live",
      task,
      domainTechnologiesResultSchema,
    ),
    billing: buildTaskBilling(task),
  };
}
