import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./better-auth-schema";

export const billingCustomerStatus = sqliteTable("billing_customer_status", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  isPaying: integer("is_paying", { mode: "boolean" }).notNull().default(false),
  paidPlanId: text("paid_plan_id"),
  paidPlanStatus: text("paid_plan_status"),
  // Full Autumn customer payload — escape hatch for any field we don't flatten,
  // queryable via json_extract so we never have to widen this table.
  customerJson: text("customer_json").notNull(),
  syncedAt: text("synced_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Credit ledger for the subscription tier: one row per organization. Monthly
// bundle credits reset every 30 days anchored at monthly_period_start; top-up
// credits never reset. Both balances and the anchor are written explicitly by
// the credits service, so only the credit columns carry defaults.
export const organizationCreditBalance = sqliteTable(
  "organization_credit_balance",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    monthlyCredits: integer("monthly_credits").notNull().default(0),
    // ISO-8601 UTC timestamp anchoring the current 30-day monthly period.
    monthlyPeriodStart: text("monthly_period_start").notNull(),
    topupCredits: integer("topup_credits").notNull().default(0),
    // ISO-8601 UTC timestamp, set by the credits service on every write.
    updatedAt: text("updated_at").notNull(),
  },
);

// Idempotency ledger for the Whop top-up webhook: one row per credited
// payment. The webhook claims the payment id (PK) before crediting, so a
// replayed delivery is a no-op. organizationId/credits are filled in once the
// credit lands; a row only exists for fully-credited payments (failed claims
// are unclaimed so Whop's retry can complete the credit).
export const processedWhopPayment = sqliteTable("processed_whop_payment", {
  paymentId: text("payment_id").primaryKey(),
  organizationId: text("organization_id"),
  credits: integer("credits"),
  // ISO-8601 UTC timestamp of the claim.
  processedAt: text("processed_at").notNull(),
});
