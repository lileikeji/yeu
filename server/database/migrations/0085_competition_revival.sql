ALTER TABLE `competition_events` ADD COLUMN `revival_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_events` ADD COLUMN `revival_slots` integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_round_entries` ADD COLUMN `revived` integer DEFAULT 0 NOT NULL;
