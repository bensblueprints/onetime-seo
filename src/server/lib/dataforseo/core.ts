import {
  AiOptimizationApi,
  AppendixApi,
  BacklinksApi,
  BusinessDataApi,
  ContentAnalysisApi,
  DataforseoLabsApi,
  KeywordsDataApi,
  OnPageApi,
  SerpApi,
} from "dataforseo-client";
import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import type { ErrorCode } from "@/shared/error-codes";

const API_BASE = "https://api.dataforseo.com";
const MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH = 1600;
// Safety ceiling on any live call (Lighthouse is the slowest, ~tens of seconds).
const DATAFORSEO_REQUEST_TIMEOUT_MS = 60_000;
// Retry idempotent reads on transient 5xx. Total attempts = retries + 1; the
// shared request-timeout signal still caps overall wall time.
const DATAFORSEO_MAX_RETRIES = 2;
const DATAFORSEO_RETRY_BACKOFF_MS = 250;

/**
 * Translates a DataForSEO HTTP/task failure into a product-specific AppError
 * (e.g. "billing issue"). Returns null when the failure isn't one this
 * classifier recognises, so the caller can fall back to a generic error. See
 * {@link createDataforseoBillingClassifier}.
 */
export type DataforseoErrorClassifier = (
  status: number | undefined,
  details: string,
  path: string,
) => AppError | null;

/**
 * Resolves which DataForSEO key a request should authenticate with: the org's
 * own key (set in Settings, decrypted from the DB) wins; otherwise the shared
 * DATAFORSEO_API_KEY env var (self-host and platform-key deployments). Throws
 * DATAFORSEO_KEY_MISSING when neither exists so the UI can point the user at
 * Settings instead of surfacing a raw 401.
 */
export async function resolveDataforseoApiKey(
  organizationId: string,
): Promise<string> {
  // Lazy import: org-key pulls in @/db (drizzle, better-auth crypto), which is
  // fine inside this lazily loaded subtree but must not join core.ts's static
  // import graph — the section modules import core.ts eagerly within that
  // subtree and their tests stub only the env layer, not the db.
  const { getOrgDataforseoKey } =
    await import("@/server/lib/dataforseo/org-key");
  const orgKey = await getOrgDataforseoKey(organizationId);
  if (orgKey) {
    return orgKey;
  }
  try {
    return await getRequiredEnvValue("DATAFORSEO_API_KEY");
  } catch {
    throw new AppError(
      "DATAFORSEO_KEY_MISSING",
      "Add your DataForSEO API key in Settings",
    );
  }
}

function formatDataforseoErrorPayload(value: unknown): string {
  const text =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

  return text.length > MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH
    ? `${text.slice(0, MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH)}... [truncated]`
    : text;
}

function formatDataforseoRequestPath(url: RequestInfo): string {
  const rawUrl = typeof url === "string" ? url : url.url;
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl;
  }
}

/**
 * The single authenticated `fetch` used by every DataForSEO SDK call. Throws on
 * non-2xx so the SDK's own `ApiException` path never fires; task-level failures
 * (which return HTTP 200) are handled downstream by {@link assertOk}. An
 * optional classifier maps recognised HTTP failures to product errors. When
 * `apiKeyOverride` is given (the caller's per-org key) it is used as-is;
 * otherwise the shared DATAFORSEO_API_KEY env var is read lazily per request.
 */
function createAuthenticatedFetch(
  classify?: DataforseoErrorClassifier,
  apiKeyOverride?: string,
) {
  return async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const apiKey =
      apiKeyOverride ?? (await getRequiredEnvValue("DATAFORSEO_API_KEY"));
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Basic ${apiKey}`);
    // Resolve the signal once so retries share the overall request timeout
    // rather than restarting a fresh 60s budget on each attempt.
    const signal =
      init?.signal ?? AbortSignal.timeout(DATAFORSEO_REQUEST_TIMEOUT_MS);

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { ...init, headers, signal });
      if (response.ok) return response;

      // Transient upstream 5xx on an idempotent read -> back off and retry.
      if (response.status >= 500 && attempt < DATAFORSEO_MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, DATAFORSEO_RETRY_BACKOFF_MS * (attempt + 1)),
        );
        continue;
      }

      const rawText = await response.text();
      const path = formatDataforseoRequestPath(url);
      const classified = classify?.(response.status, rawText, path);
      if (classified) throw classified;

      const code: ErrorCode =
        response.status >= 500
          ? "UPSTREAM_UNAVAILABLE"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status === 401
              ? "DATAFORSEO_AUTH_FAILED"
              : "INTERNAL_ERROR";
      const error = new AppError(
        code,
        `DataForSEO HTTP ${response.status} on ${path}`,
        {
          provider: "dataforseo",
          providerStatus: String(response.status),
          providerPath: path,
          responseBody: formatDataforseoErrorPayload(rawText),
        },
      );
      error.name = "DataForSEOHttpError";
      throw error;
    }
  };
}

function http(classify?: DataforseoErrorClassifier, apiKey?: string) {
  return { fetch: createAuthenticatedFetch(classify, apiKey) };
}

/**
 * Raw task_post through the same authenticated fetch (auth, timeout, retries,
 * HTTP error mapping) as the SDK calls — for endpoints the installed
 * dataforseo-client (2.0.19) does not model, e.g. YouTube organic SERP.
 * Returns the parsed JSON body for the caller to run through assertOk.
 */
export async function postDataforseoTasks(
  path: string,
  tasks: unknown[],
  apiKey?: string,
): Promise<unknown> {
  const response = await createAuthenticatedFetch(undefined, apiKey)(
    `${API_BASE}${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tasks),
    },
  );
  return response.json();
}

// Per-section API factories. Each is created per-request so the auth secret is
// read lazily (it lives in the Worker env, not in module scope). The optional
// `apiKey` carries the caller's resolved per-org key; when omitted the factory
// falls back to the DATAFORSEO_API_KEY env var (self-host behavior).
export const labsApi = (apiKey?: string) =>
  new DataforseoLabsApi(API_BASE, http(undefined, apiKey));
export const keywordsDataApi = (apiKey?: string) =>
  new KeywordsDataApi(API_BASE, http(undefined, apiKey));
export const serpApi = (apiKey?: string) =>
  new SerpApi(API_BASE, http(undefined, apiKey));
export const businessDataApi = (apiKey?: string) =>
  new BusinessDataApi(API_BASE, http(undefined, apiKey));
export const onPageApi = (apiKey?: string) =>
  new OnPageApi(API_BASE, http(undefined, apiKey));
// Account/appendix data (spend, balance, rates). userData() is FREE ($0) and
// read-only — do NOT wire it through metering.
export const appendixApi = (apiKey?: string) =>
  new AppendixApi(API_BASE, http(undefined, apiKey));
export const backlinksApi = (
  classify?: DataforseoErrorClassifier,
  apiKey?: string,
) => new BacklinksApi(API_BASE, http(classify, apiKey));
export const aiOptimizationApi = (
  classify?: DataforseoErrorClassifier,
  apiKey?: string,
) => new AiOptimizationApi(API_BASE, http(classify, apiKey));
export const contentAnalysisApi = (
  classify?: DataforseoErrorClassifier,
  apiKey?: string,
) => new ContentAnalysisApi(API_BASE, http(classify, apiKey));
