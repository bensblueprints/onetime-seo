import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getOptionalEnvValue } = vi.hoisted(() => ({
  getOptionalEnvValue: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({ getOptionalEnvValue }));

import { createCustomTopupCheckoutUrl } from "./topupCheckout";

const ENV: Record<string, string> = {
  WHOP_API_KEY: "whop_key_123",
  WHOP_COMPANY_ID: "biz_123",
  WHOP_TOPUP_PRODUCT_ID: "prod_topup123",
};

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  getOptionalEnvValue.mockReset();
  getOptionalEnvValue.mockImplementation(async (name: string) => ENV[name]);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("createCustomTopupCheckoutUrl", () => {
  it("creates an inline one-time plan and returns the purchase url", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "ch_123",
          purchase_url: "https://whop.com/checkout/plan_x?session=ch_123",
        }),
        { status: 200 },
      ),
    );

    await expect(createCustomTopupCheckoutUrl("org_1", 75)).resolves.toBe(
      "https://whop.com/checkout/plan_x?session=ch_123",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.whop.com/api/v1/checkout_configurations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer whop_key_123",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.plan).toMatchObject({
      company_id: "biz_123",
      product_id: "prod_topup123",
      initial_price: 75,
      currency: "usd",
    });
    expect(body.plan).not.toHaveProperty("billing_period");
    expect(body.metadata).toMatchObject({
      organizationId: "org_1",
      topup: "true",
    });
  });

  it("returns null on a non-OK response", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 422 }));
    await expect(createCustomTopupCheckoutUrl("org_1", 75)).resolves.toBeNull();
  });

  it("returns null when the response has no purchase url", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "ch_123" }), { status: 200 }),
    );
    await expect(createCustomTopupCheckoutUrl("org_1", 75)).resolves.toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(createCustomTopupCheckoutUrl("org_1", 75)).resolves.toBeNull();
  });

  it("returns null without calling the API when env is missing", async () => {
    getOptionalEnvValue.mockResolvedValue(undefined);
    await expect(createCustomTopupCheckoutUrl("org_1", 75)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
