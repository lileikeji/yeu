-- yeu:replace-unique competition_popularity_ballots(event_id,device_hash)
-- yeu:replace-unique competition_popularity_ballots(event_id,voter_openid_hash)
ALTER TABLE `competition_popularity_settings` ADD COLUMN `votes_per_voter` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `vote_index` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `competition_popularity_ballots_event_device_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `competition_popularity_ballots_event_openid_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_ballots_event_device_slot_unique` ON `competition_popularity_ballots` (`event_id`, `device_hash`, `vote_index`);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_ballots_event_openid_slot_unique` ON `competition_popularity_ballots` (`event_id`, `voter_openid_hash`, `vote_index`) WHERE `voter_openid_hash` IS NOT NULL;
