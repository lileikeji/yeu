ALTER TABLE `place_reviews` ADD `source` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `place_reviews` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `place_reviews` ADD `source_platform` text;--> statement-breakpoint
ALTER TABLE `place_reviews` ADD `collected_at` integer;