import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

type Balance = {
  organizationId: string;
  monthlyCredits: number;
  monthlyPeriodStart: string;
  topupCredits: number;
  updatedAt: string;
};

type Processed = {
  paymentId: string;
  organizationId: string | null;
  credits: number | null;
  processedAt: string;
};

// In-memory stand-ins for the four tables the webhook touches, in the same
// style as src/server/features/credits/creditsService.test.ts: single-account /
// single-org fixtures, so `where` conditions are ignored and `set` values are
// applied directly. update()'s where() returns a thenable that also exposes
// .returning(), matching how drizzle's query builder is awaited both ways.
const store = {
  balance: null as Balance | null,
  processed: new Map<string, Processed>(),
  account: null as { userId: string } | null,
  member: null as { organizationId: string } | null,
};

function applyMarkerUpdate(values: Partial<Processed>): Processed[] {
  const rows: Processed[] = [];
  for (const [id, row] of store.processed) {
    const updated = { ...row, ...values };
    store.processed.set(id, updated);
    rows.push(updated);
  }
  return rows;
}

vi.mock("@/db", () => ({
  db: {
    query: {
      account: {
        findFirst: vi.fn(async () => store.account ?? undefined),
      },
      member: {
        findFirst: vi.fn(async () => store.member ?? undefined),
      },
      organizationCreditBalance: {
        findFirst: vi.fn(async () => store.balance ?? undefined),
      },
      processedWhopPayment: {
        // Single-payment tests: the first stored row is the one any
        // payment_id where-clause would match.
        findFirst: vi.fn(
          async () => [...store.processed.values()][0] ?? undefined,
        ),
      },
    },
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: vi.fn(async () => {
            if (isBalanceTable(table)) {
              if (store.balance) return [];
              store.balance = { ...(values as unknown as Balance) };
              return [store.balance];
            }
            const paymentId = values.paymentId as string;
            if (store.processed.has(paymentId)) return [];
            const row: Processed = {
              paymentId,
              organizationId: (values.organizationId as string | null) ?? null,
              credits: (values.credits as number | null) ?? null,
              processedAt: values.processedAt as string,
            };
            store.processed.set(paymentId, row);
            return [row];
          }),
        }),
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: vi.fn(() => {
          const returning = async () => {
            if (isBalanceTable(table)) {
              if (!store.balance) return [];
              store.balance = { ...store.balance, ...(values as Partial<Balance>) };
              return [store.balance];
            }
            return applyMarkerUpdate(values as Partial<Processed>);
          };
          const promise = returning();
          return Object.assign(promise, { returning });
        }),
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        store.processed.clear();
      }),
    })),
  },
}));

import { organizationCreditBalance } from "@/db/billing.schema";
import { handleWhopWebhookRequest } from "./topup-webhook";

function isBalanceTable(table: unknown): boolean {
  return table === organizationCreditBalance;
}

const TOPUP_PRODUCT_ID = "prod_SPJGcRRMsPL0R";
const SECRET_B64 = Buffer.from("test-whop-webhook-secret").toString("base64");

function sign(body: string, id: string, timestampSeconds: number): string {
  const signature = createHmac(
    "sha256",
    Buffer.from(SECRET_B64, "base64"),
  )
    .update(`${id}.${timestampSeconds}.${body}`)
    .digest("base64");
  return `v1,${signature}`;
}

function webhookRequest(
  body: string,
  opts: { id?: string; signature?: string } = {},
): Request {
  const id = opts.id ?? "msg_test_1";
  const timestamp = Math.floor(Date.now() / 1000);
  return new Request("https://app.test/api/whop/webhook", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": opts.signature ?? sign(body, id, timestamp),
    },
  });
}

function topupPaymentBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "payment.succeeded",
    data: {
      id: "pay_topup_1",
      product: { id: TOPUP_PRODUCT_ID },
      user: { id: "user_whop_1" },
      usd_total: 10,
      total: 10,
      ...overrides,
    },
  });
}

beforeEach(() => {
  process.env.WHOP_WEBHOOK_SECRET = SECRET_B64;
  process.env.WHOP_TOPUP_PRODUCT_ID = TOPUP_PRODUCT_ID;
  store.balance = null;
  store.processed.clear();
  store.account = { userId: "app_user_1" };
  store.member = { organizationId: "org_1" };
});

afterAll(() => {
  delete process.env.WHOP_WEBHOOK_SECRET;
  delete process.env.WHOP_TOPUP_PRODUCT_ID;
});

describe("handleWhopWebhookRequest", () => {
  it("credits the buyer's organization with the exact cent amount", async () => {
    const response = await handleWhopWebhookRequest(
      webhookRequest(topupPaymentBody()),
    );

    expect(response.status).toBe(200);
    // $10.00 → 1000 credits (1 credit = $0.01).
    expect(store.balance?.organizationId).toBe("org_1");
    expect(store.balance?.topupCredits).toBe(1000);
    expect(store.processed.get("pay_topup_1")).toMatchObject({
      organizationId: "org_1",
      credits: 1000,
    });
  });

  it("uses usd_total over the payment-currency total", async () => {
    const response = await handleWhopWebhookRequest(
      webhookRequest(topupPaymentBody({ usd_total: 25.5, total: 2300 })),
    );

    expect(response.status).toBe(200);
    expect(store.balance?.topupCredits).toBe(2550);
  });

  it("rejects a bad signature with 401 and credits nothing", async () => {
    const body = topupPaymentBody();
    const response = await handleWhopWebhookRequest(
      webhookRequest(body, { signature: "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }),
    );

    expect(response.status).toBe(401);
    expect(store.balance).toBeNull();
    expect(store.processed.size).toBe(0);
  });

  it("rejects the webhook when WHOP_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.WHOP_WEBHOOK_SECRET;

    const response = await handleWhopWebhookRequest(
      webhookRequest(topupPaymentBody()),
    );

    expect(response.status).toBe(401);
    expect(store.balance).toBeNull();
  });

  it("treats a replayed payment as a no-op (no double credit)", async () => {
    const body = topupPaymentBody();

    const first = await handleWhopWebhookRequest(webhookRequest(body));
    // Whop may re-deliver under a different webhook-id; the payment id dedups.
    const replay = await handleWhopWebhookRequest(
      webhookRequest(body, { id: "msg_test_2" }),
    );

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(store.balance?.topupCredits).toBe(1000);
  });

  it("re-attempts crediting when a prior delivery crashed after claiming", async () => {
    // Simulate a hard crash between claim-insert and crediting: a claim row
    // exists with no organization recorded. The next delivery must complete
    // the credit, not no-op (Whop stops retrying on 200).
    store.processed.set("pay_topup_1", {
      paymentId: "pay_topup_1",
      organizationId: null,
      credits: null,
      processedAt: new Date().toISOString(),
    });

    const response = await handleWhopWebhookRequest(
      webhookRequest(topupPaymentBody()),
    );

    expect(response.status).toBe(200);
    expect(store.balance?.topupCredits).toBe(1000);
    expect(store.processed.get("pay_topup_1")).toMatchObject({
      organizationId: "org_1",
      credits: 1000,
    });
  });

  it("ignores payments for other products", async () => {
    const response = await handleWhopWebhookRequest(
      webhookRequest(
        topupPaymentBody({ product: { id: "prod_bhzt0w68pMpXI" } }),
      ),
    );

    expect(response.status).toBe(200);
    expect(store.balance).toBeNull();
    expect(store.processed.size).toBe(0);
  });

  it("ignores non-payment events", async () => {
    const body = JSON.stringify({
      type: "membership.activated",
      data: { id: "mem_1" },
    });

    const response = await handleWhopWebhookRequest(webhookRequest(body));

    expect(response.status).toBe(200);
    expect(store.balance).toBeNull();
    expect(store.processed.size).toBe(0);
  });

  it("logs and 200s when the buyer cannot be resolved to an org", async () => {
    store.account = null;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleWhopWebhookRequest(
      webhookRequest(topupPaymentBody()),
    );

    expect(response.status).toBe(200);
    expect(store.balance).toBeNull();
    // Claim was rolled back, so a re-fire after fixing the linkage can credit.
    expect(store.processed.size).toBe(0);
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("rejects non-POST requests with 405", async () => {
    const response = await handleWhopWebhookRequest(
      new Request("https://app.test/api/whop/webhook", { method: "GET" }),
    );

    expect(response.status).toBe(405);
  });
});
