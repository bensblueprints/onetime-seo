CREATE TABLE "organization_credit_balance" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"monthly_credits" integer DEFAULT 0 NOT NULL,
	"monthly_period_start" text NOT NULL,
	"topup_credits" integer DEFAULT 0 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_credit_balance" ADD CONSTRAINT "organization_credit_balance_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;