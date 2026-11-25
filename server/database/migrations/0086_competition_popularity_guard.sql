ALTER TABLE `competition_popularity_ballots` ADD COLUMN `voided` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `voided_reason` text;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `voided_at` integer;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `voided_by` text;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `suspicion_score` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `suspicion_reasons_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `ua_summary` text;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `env_hash` text;
--> statement-breakpoint
ALTER TABLE `competition_popularity_ballots` ADD COLUMN `dwell_ms` integer;
--> statement-breakpoint
CREATE INDEX `competition_popularity_ballots_event_voided_idx` ON `competition_popularity_ballots` (`event_id`, `voided`, `created_at`);
--> statement-breakpoint
CREATE TABLE `competition_popularity_vote_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`seq` integer NOT NULL,
	`ballot_id` text,
	`singer_id` text,
	`prev_singer_id` text,
	`action` text NOT NULL,
	`block_code` text,
	`device_hash` text NOT NULL,
	`ip_hash` text,
	`env_hash` text,
	`qr_nonce` text,
	`ua_summary` text DEFAULT 'unknown' NOT NULL,
	`cookie_present` integer DEFAULT 0 NOT NULL,
	`dwell_ms` integer,
	`suspicion_score` integer DEFAULT 0 NOT NULL,
	`suspicion_reasons_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ballot_id`) REFERENCES `competition_popularity_ballots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`singer_id`) REFERENCES `competition_singers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "competition_popularity_vote_logs_action_check" CHECK(`action` in ('cast', 'change', 'blocked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_vote_logs_event_seq_unique` ON `competition_popularity_vote_logs` (`event_id`, `seq`);
--> statement-breakpoint
CREATE INDEX `competition_popularity_vote_logs_event_created_idx` ON `competition_popularity_vote_logs` (`event_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `competition_popularity_vote_logs_event_singer_idx` ON `competition_popularity_vote_logs` (`event_id`, `singer_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `competition_popularity_vote_logs_ballot_idx` ON `competition_popularity_vote_logs` (`ballot_id`);
--> statement-breakpoint
CREATE TABLE `competition_popularity_inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`mode` text NOT NULL,
	`from_seq` integer NOT NULL,
	`to_seq` integer NOT NULL,
	`target_log_id` text,
	`target_singer_id` text,
	`log_count` integer NOT NULL,
	`verdict` text NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`estimated_brush_in_batch` integer DEFAULT 0 NOT NULL,
	`headline` text NOT NULL,
	`findings_json` text DEFAULT '[]' NOT NULL,
	`flagged_seqs_json` text DEFAULT '[]' NOT NULL,
	`memory_note` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`trigger_source` text DEFAULT 'manual' NOT NULL,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_popularity_inspections_mode_check" CHECK(`mode` in ('auto-batch', 'manual-batch', 'single-log', 'singer-focus')),
	CONSTRAINT "competition_popularity_inspections_verdict_check" CHECK(`verdict` in ('clean', 'watch', 'suspect')),
	CONSTRAINT "competition_popularity_inspections_trigger_check" CHECK(`trigger_source` in ('auto', 'manual'))
);
--> statement-breakpoint
CREATE INDEX `competition_popularity_inspections_event_created_idx` ON `competition_popularity_inspections` (`event_id`, `created_at`);
