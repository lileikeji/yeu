ALTER TABLE `competition_popularity_settings` DROP COLUMN `fixed_passcode`;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `allow_withdraw` integer DEFAULT 1 NOT NULL;
