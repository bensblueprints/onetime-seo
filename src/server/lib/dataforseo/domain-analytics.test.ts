import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchDomainTechnologies,
  fetchWhoisOverview,
} from "@/server/lib/dataforseo/domain-analytics";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

function requestedUrls(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchMock.mock.calls.map(([url]) =>
    typeof url === "string" || url instanceof URL ? url.toString() : url.url,
  );
}

const WHOIS_PATH = ["v3", "domain_analytics", "whois", "overview", "live"];
const TECHNOLOGIES_PATH = [
  "v3",
  "domain_analytics",
  "technologies",
  "domain_technologies",
  "live",
];

function whoisTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-whois",
    status_code: 20000,
    cost: 0.102,
    path: WHOIS_PATH,
    result: [
      {
        total_count: 1,
        items_count: 1,
        items: [
          {
            domain: "youtube.com",
            created_datetime: "2005-02-15 03:13:12 +00:00",
            changed_datetime: "2026-01-14 08:29:14 +00:00",
            expiration_datetime: "2027-02-15 03:13:12 +00:00",
            updated_datetime: "2026-02-10 04:45:47 +00:00",
            first_seen: "2020-10-06 21:00:00 +00:00",
            epp_status_codes: [
              "client_delete_prohibited",
              "client_transfer_prohibited",
            ],
            tld: "com",
            registered: true,
            registrar: "MarkMonitor Inc.",
            metrics: { organic: { etv: 15370164717.4 } },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function technologiesTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-tech",
    status_code: 20000,
    cost: 0.01,
    path: TECHNOLOGIES_PATH,
    result: [
      {
        type: "domain_technology_item",
        domain: "dataforseo.com",
        title: "Powerful API Stack For Data-Driven SEO Tools – DataForSEO",
        description: "We provide comprehensive data solutions...",
        phone_numbers: ["+3726027642"],
        emails: ["info@dataforseo.com"],
        social_graph_urls: ["https://dataforseo.com"],
        technologies: {
          web_development: {
            javascript_libraries: ["jQuery", "prettyPhoto"],
            programming_languages: ["PHP"],
          },
          servers: {
            cdn: ["Cloudflare"],
            databases: ["MySQL"],
          },
          content: {
            cms: ["WordPress"],
          },
        },
      },
    ],
    ...overrides,
  };
}

describe("whois overview live", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts an exact-domain filter and parses whois items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [whoisTask()],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWhoisOverview({ target: "youtube.com" });

    expect(requestedUrls(fetchMock)).toEqual([
      "https://api.dataforseo.com/v3/domain_analytics/whois/overview/live",
    ]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([
      {
        filters: [["domain", "=", "youtube.com"]],
        limit: 1,
      },
    ]);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      domain: "youtube.com",
      registrar: "MarkMonitor Inc.",
      created_datetime: "2005-02-15 03:13:12 +00:00",
      expiration_datetime: "2027-02-15 03:13:12 +00:00",
      registered: true,
      epp_status_codes: ["client_delete_prohibited", "client_transfer_prohibited"],
    });
    expect(result.billing).toEqual({
      path: WHOIS_PATH,
      costUsd: 0.102,
    });
  });

  it("surfaces a charged failed task through the billing envelope", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id: "task-whois",
            status_code: 40501,
            status_message: "Invalid Field: 'domain'.",
            cost: 0.102,
            path: WHOIS_PATH,
            data: { filters: [["domain", "=", ""]] },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWhoisOverview({ target: "" })).rejects.toThrow(
      /Invalid Field/,
    );
  });

  it("rejects a malformed items payload instead of returning garbage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          whoisTask({
            result: [
              {
                total_count: 1,
                items: [{ domain: "youtube.com", registered: "yes" }],
              },
            ],
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWhoisOverview({ target: "youtube.com" })).rejects.toThrow(
      /invalid response shape/,
    );
  });
});

describe("domain technologies live", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the target and parses the technologies result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [technologiesTask()],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDomainTechnologies({ target: "dataforseo.com" });

    expect(requestedUrls(fetchMock)).toEqual([
      "https://api.dataforseo.com/v3/domain_analytics/technologies/domain_technologies/live",
    ]);
    expect(
      parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1]),
    ).toMatchObject([{ target: "dataforseo.com" }]);

    expect(result.data).toMatchObject({
      domain: "dataforseo.com",
      emails: ["info@dataforseo.com"],
      phone_numbers: ["+3726027642"],
      technologies: {
        servers: { cdn: ["Cloudflare"] },
        content: { cms: ["WordPress"] },
      },
    });
    expect(result.billing).toEqual({
      path: TECHNOLOGIES_PATH,
      costUsd: 0.01,
    });
  });

  it("returns null when the task carries no result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [technologiesTask({ result: [] })],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDomainTechnologies({ target: "unknown.example" });

    expect(result.data).toBeNull();
    expect(result.billing).toEqual({
      path: TECHNOLOGIES_PATH,
      costUsd: 0.01,
    });
  });

  it("rejects a malformed technologies payload instead of returning garbage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          technologiesTask({
            result: [
              {
                type: "domain_technology_item",
                domain: "dataforseo.com",
                technologies: { servers: { cdn: "Cloudflare" } },
              },
            ],
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchDomainTechnologies({ target: "dataforseo.com" }),
    ).rejects.toThrow(/invalid response shape/);
  });
});
