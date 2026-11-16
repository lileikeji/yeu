DROP INDEX IF EXISTS `competition_events_content_unique`;
--> statement-breakpoint
ALTER TABLE `competition_events` ADD `is_current` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_events` ADD `reminder_subject` text;
--> statement-breakpoint
ALTER TABLE `competition_events` ADD `reminder_body` text;
--> statement-breakpoint
CREATE INDEX `competition_events_content_current_idx` ON `competition_events` (`content_id`,`is_current`);
--> statement-breakpoint
ALTER TABLE `competition_rounds` ADD `roster_confirmed_at` integer;
--> statement-breakpoint
ALTER TABLE `competition_rounds` ADD `result_query_open` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_round_entries` ADD `advanced` integer;
--> statement-breakpoint
ALTER TABLE `competition_rounds` ADD `score_precision` text DEFAULT 'integer' NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_singers` ADD `qq` text;
--> statement-breakpoint
ALTER TABLE `competition_pre_registrations` ADD `qq` text;
--> statement-breakpoint
CREATE TABLE `competition_email_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`singer_id` text NOT NULL,
	`token` text NOT NULL,
	`confirmed_at` integer,
	`created_at` integer,
	CONSTRAINT `competition_email_receipts_round_check` CHECK(`round_key` in ('prelim', 'semi', 'final')),
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`singer_id`) REFERENCES `competition_singers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_email_receipts_unique` ON `competition_email_receipts` (`event_id`,`round_key`,`singer_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_email_receipts_token_unique` ON `competition_email_receipts` (`token`);
