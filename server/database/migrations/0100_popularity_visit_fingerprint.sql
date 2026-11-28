ALTER TABLE `competition_popularity_visits` ADD COLUMN `ip_hash` text;
--> statement-breakpoint
ALTER TABLE `competition_popularity_visits` ADD COLUMN `env_hash` text;
--> statement-breakpoint
CREATE INDEX `competition_popularity_visits_event_iphash_created_idx` ON `competition_popularity_visits` (`event_id`,`ip_hash`,`created_at`);
