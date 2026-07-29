import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const WHOP_CHECKOUT_CONFIGURATIONS_URL =
  "https://api.whop.com/api/v1/checkout_configurations";

/**
 * Creates a Whop checkout configuration with an inline one-time plan for a
 * custom credit top-up amount, and returns its purchase URL. The plan is
 * created on the credits product (WHOP_TOPUP_PRODUCT_ID), so the payment
 * webhook credits it like any preset pack. Returns null when the API can't
 * produce a checkout (missing env, HTTP failure, malformed response) — callers
 * fall back to the nearest preset pack.
 *
 * API shape verified against
 * https://docs.whop.com/api-reference/checkout-configurations/create-checkout-configuration
 * (inline `plan` with `initial_price` and no `billing_period` = one-time
 * charge; response carries `purchase_url`).
 */
export async function createCustomTopupCheckoutUrl(
  organizationId: string,
  amountUsd: number,
): Promise<string | null> {
  const apiKey = await getOptionalEnvValue("WHOP_API_KEY");
  const companyId = await getOptionalEnvValue("WHOP_COMPANY_ID");
  const productId = await getOptionalEnvValue("WHOP_TOPUP_PRODUCT_ID");
  if (!apiKey || !companyId || !productId) return null;

  try {
    const response = await fetch(WHOP_CHECKOUT_CONFIGURATIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan: {
          company_id: companyId,
          product_id: productId,
          initial_price: amountUsd,
          currency: "usd",
          title: `OneTime SEO credits top-up ($${amountUsd})`,
          force_create_new_plan: true,
        },
        metadata: { organizationId, topup: "true" },
      }),
    });
    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "purchase_url" in body &&
      typeof body.purchase_url === "string"
    ) {
      return body.purchase_url;
    }
    return null;
  } catch {
    return null;
  }
}
