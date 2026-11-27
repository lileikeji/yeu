ALTER TABLE `competition_popularity_settings` ADD COLUMN `wechat_bonus_votes` integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `show_rank_gap` integer DEFAULT 0 NOT NULL;
