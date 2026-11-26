DROP INDEX IF EXISTS `competition_popularity_ballots_event_device_slot_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_ballots_event_device_slot_unique` ON `competition_popularity_ballots` (`event_id`, `device_hash`, `vote_index`) WHERE `voided` = 0;
--> statement-breakpoint
DROP INDEX IF EXISTS `competition_popularity_ballots_event_openid_slot_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_ballots_event_openid_slot_unique` ON `competition_popularity_ballots` (`event_id`, `voter_openid_hash`, `vote_index`) WHERE `voter_openid_hash` is not null and `voided` = 0;
