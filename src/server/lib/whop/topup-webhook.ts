import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account, member, processedWhopPayment } from "@/db/schema";
import { verifySvixSignature } from "@/server/billing/svix";
import { addTopupCredits } from "@/server/features/credits/creditsService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

export const WHOP_WEBHOOK_PATH = "/api/whop/webhook";

// Whop webhooks follow the Standard Webhooks spec (webhook-id /
// webhook-timestamp / webhook-signature headers, HMAC-SHA256 over
// "{id}.{timestamp}.{body}") — the exact envelope verifySvixSignature checks.
// https://docs.whop.com/developer/guides/webhooks
const webhookEnvelopeSchema = z
  .object({
    type: z.string(),
    data: z.unknown(),
  })
  .passthrough();

// The `payment.succeeded` data payload (Whop API v1 Payment object). Amounts
// are decimal dollars, not cents: `usd_total` is the amount normalized to USD,
// `total` the amount in the payment currency. Nested objects carry the ids.
const paymentPayloadSchema = z
  .object({
    id: z.string(),
    product: z.object({ id: z.string() }).nullish(),
    user: z.object({ id: z.string() }).nullish(),
    usd_total: z.number().nullish(),
    total: z.number().nullish(),
  })
  .passthrough();

export async function handleWhopWebhookRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      headers: { Allow: "POST" },
      status: 405,
    });
  }

  const rawPayload = await request.text();

  // No secret configured means we cannot verify ANY signature — reject
  // everything rather than falling open.
  const webhookSecret = await getOptionalEnvValue("WHOP_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("WHOP_WEBHOOK_SECRET is not set; rejecting webhook");
    return json({ error: "Webhook not configured" }, 401);
  }

  const isVerified = await verifySvixSignature({
    headers: request.headers,
    payload: rawPayload,
    secret: webhookSecret,
  });
  if (!isVerified) {
    return json({ error: "Invalid webhook signature" }, 401);
  }

  let envelope: z.infer<typeof webhookEnvelopeSchema>;
  try {
    envelope = webhookEnvelopeSchema.parse(JSON.parse(rawPayload));
  } catch {
    return json({ error: "Invalid webhook payload" }, 400);
  }

  // Only top-up payments credit anything; every other event is an ACK'd no-op
  // so Whop doesn't waste retries on it.
  if (envelope.type !== "payment.succeeded") {
    return json({ received: true });
  }

  const parsed = paymentPayloadSchema.safeParse(envelope.data);
  if (!parsed.success) {
    // Verified as genuinely from Whop, so a shape we can't process is our bug
    // or an API change — log it, but don't ask Whop to retry.
    console.error(
      "Whop payment.succeeded payload did not match expected shape",
      parsed.error,
    );
    return json({ received: true });
  }
  const payment = parsed.data;

  const topupProductId = await getOptionalEnvValue("WHOP_TOPUP_PRODUCT_ID");
  if (!topupProductId) {
    console.error("WHOP_TOPUP_PRODUCT_ID is not set; ignoring payment event");
    return json({ received: true });
  }
  if (payment.product?.id !== topupProductId) {
    return json({ received: true });
  }

  // 1 credit = $0.01. Amounts arrive as decimal dollars (e.g. 10 → 1000).
  // Fail closed when usd_total is absent: `total` is in the payment's own
  // currency and would mis-credit non-USD payments.
  const paidDollars = payment.usd_total;
  const credits = paidDollars == null ? 0 : Math.round(paidDollars * 100);
  if (credits <= 0) {
    console.error("Whop top-up payment has no usable amount", payment.id);
    return json({ received: true });
  }

  // Claim the payment id first: the PK is the dedup key, so a replayed (or
  // concurrently re-delivered) event short-circuits here as a no-op.
  const [claim] = await db
    .insert(processedWhopPayment)
    .values({ paymentId: payment.id, processedAt: new Date().toISOString() })
    .onConflictDoNothing()
    .returning();
  if (!claim) {
    // A row already exists. A completed claim (org recorded) is a replay —
    // no-op. An incomplete claim (hard crash between claim and credit) must
    // NOT no-op: Whop stops retrying on 200 and the customer would never be
    // credited. Fall through and re-attempt the credit for this delivery.
    const existing = await db.query.processedWhopPayment.findFirst({
      where: eq(processedWhopPayment.paymentId, payment.id),
    });
    if (existing?.organizationId) {
      return json({ received: true });
    }
  }

  const whopUserId = payment.user?.id;
  const organizationId = whopUserId
    ? await resolveBuyerOrganizationId(whopUserId)
    : undefined;
  if (!organizationId) {
    // Unclaim so a manual re-fire from the Whop dashboard can credit once the
    // linkage is fixed. 200 regardless — never retry-storm Whop over a buyer
    // we can't resolve; the miss is reported via the log.
    await unclaim(payment.id);
    console.error(
      "Whop top-up payment could not be resolved to an organization",
      { paymentId: payment.id, whopUserId, credits },
    );
    return json({ received: true });
  }

  try {
    await addTopupCredits(organizationId, credits);
    await db
      .update(processedWhopPayment)
      .set({ organizationId, credits })
      .where(eq(processedWhopPayment.paymentId, payment.id));
  } catch (error) {
    // Unclaim so Whop's retry (it retries non-2xx) can complete the credit.
    await unclaim(payment.id);
    console.error("Whop top-up crediting failed", payment.id, error, {
      cause: error instanceof Error ? error.cause : undefined,
    });
    return json({ error: "Webhook processing failed" }, 500);
  }

  return json({ received: true });
}

// Whop user id → app user (better-auth account row, providerId "whop",
// accountId = whop sub) → the org they own. Reverse of the org → owner → whop
// account walk in src/server/lib/whop/org-tier.ts.
async function resolveBuyerOrganizationId(
  whopUserId: string,
): Promise<string | undefined> {
  const whopAccount = await db.query.account.findFirst({
    columns: { userId: true },
    where: and(
      eq(account.providerId, "whop"),
      eq(account.accountId, whopUserId),
    ),
  });
  if (!whopAccount) {
    return undefined;
  }

  const ownerMembership = await db.query.member.findFirst({
    columns: { organizationId: true },
    where: and(
      eq(member.userId, whopAccount.userId),
      eq(member.role, "owner"),
    ),
  });
  return ownerMembership?.organizationId;
}

async function unclaim(paymentId: string): Promise<void> {
  await db
    .delete(processedWhopPayment)
    .where(eq(processedWhopPayment.paymentId, paymentId));
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
