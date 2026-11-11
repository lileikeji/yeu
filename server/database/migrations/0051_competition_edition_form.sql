ALTER TABLE `competition_events` ADD `edition` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_events` ADD `schedule_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_events` ADD `form_fields_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_pre_registrations` ADD `preferred_day` integer;
