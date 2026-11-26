ALTER TABLE `competition_popularity_settings` ADD COLUMN `passcode_rotate` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `fixed_passcode` text DEFAULT '' NOT NULL;
