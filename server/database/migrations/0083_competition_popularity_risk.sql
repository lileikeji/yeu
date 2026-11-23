ALTER TABLE `competition_popularity_ballots` ADD COLUMN `ip_hash` text;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `risk` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `competition_popularity_ballots_event_ip_idx` ON `competition_popularity_ballots` (`event_id`, `ip_hash`, `created_at`);
