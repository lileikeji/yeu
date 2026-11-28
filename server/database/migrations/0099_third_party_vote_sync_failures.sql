ALTER TABLE `third_party_vote_sync_states` ADD COLUMN `failure_streak` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `third_party_vote_sync_states` ADD COLUMN `total_failures` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `third_party_vote_sync_states` ADD COLUMN `last_error_at` integer;
