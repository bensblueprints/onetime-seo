CREATE TABLE `organization_credit_balance` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`monthly_credits` integer DEFAULT 0 NOT NULL,
	`monthly_period_start` text NOT NULL,
	`topup_credits` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
