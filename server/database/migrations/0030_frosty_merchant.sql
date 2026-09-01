CREATE TABLE `place_merchants` (
	`place_id` text PRIMARY KEY NOT NULL,
	`meituan_url` text,
	`promo_weight` integer DEFAULT 0 NOT NULL,
	`ai_frequency` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "place_merchants_promo_weight_check" CHECK("place_merchants"."promo_weight" between 0 and 100),
	CONSTRAINT "place_merchants_ai_frequency_check" CHECK("place_merchants"."ai_frequency" between 0 and 100)
);
--> statement-breakpoint
CREATE INDEX `place_merchants_enabled_idx` ON `place_merchants` (`enabled`);
