CREATE TABLE "processed_whop_payment" (
	"payment_id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"credits" integer,
	"processed_at" text NOT NULL
);
