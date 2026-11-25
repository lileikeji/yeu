ALTER TABLE `competition_popularity_settings` ADD COLUMN `auth_mode` text DEFAULT 'wechat_mp' NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `wechat_account_name` text DEFAULT '仰恩大学指南' NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `wechat_qr_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `auto_quarantine` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `ai_auto_moderate` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `display_session_hash` text;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `voter_openid_hash` text;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `quarantined` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `quarantined_reason` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_ballots_event_openid_unique` ON `competition_popularity_ballots` (`event_id`, `voter_openid_hash`) WHERE `voter_openid_hash` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `competition_popularity_ballots_event_quarantined_idx` ON `competition_popularity_ballots` (`event_id`, `quarantined`, `created_at`);
--> statement-breakpoint
ALTER TABLE `competition_popularity_inspections` ADD COLUMN `auto_voided_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_inspections` ADD COLUMN `auto_released_count` integer DEFAULT 0 NOT NULL;
