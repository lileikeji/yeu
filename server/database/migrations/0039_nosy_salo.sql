CREATE TABLE `competition_events` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`title` text DEFAULT '新生歌手大赛' NOT NULL,
	`dimensions_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_events_content_unique` ON `competition_events` (`content_id`);--> statement-breakpoint
CREATE TABLE `competition_judge_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`judge_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`judge_id`) REFERENCES `competition_judges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_judge_sessions_token_unique` ON `competition_judge_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `competition_judge_sessions_judge_idx` ON `competition_judge_sessions` (`judge_id`);--> statement-breakpoint
CREATE INDEX `competition_judge_sessions_expires_idx` ON `competition_judge_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `competition_judges` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_id` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_judges_username_unique` ON `competition_judges` (`username`);--> statement-breakpoint
CREATE INDEX `competition_judges_event_idx` ON `competition_judges` (`event_id`);--> statement-breakpoint
CREATE INDEX `competition_judges_round_idx` ON `competition_judges` (`round_id`);--> statement-breakpoint
CREATE TABLE `competition_round_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`singer_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`advanced_from_rank` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`singer_id`) REFERENCES `competition_singers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_round_entries_round_singer_unique` ON `competition_round_entries` (`round_id`,`singer_id`);--> statement-breakpoint
CREATE INDEX `competition_round_entries_round_order_idx` ON `competition_round_entries` (`round_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `competition_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`judge_count` integer DEFAULT 5 NOT NULL,
	`advance_count` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_rounds_key_check" CHECK("competition_rounds"."key" in ('prelim', 'semi', 'final')),
	CONSTRAINT "competition_rounds_status_check" CHECK("competition_rounds"."status" in ('draft', 'open', 'closed')),
	CONSTRAINT "competition_rounds_judge_count_check" CHECK("competition_rounds"."judge_count" between 1 and 20),
	CONSTRAINT "competition_rounds_advance_count_check" CHECK("competition_rounds"."advance_count" is null or "competition_rounds"."advance_count" between 1 and 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_rounds_event_key_unique` ON `competition_rounds` (`event_id`,`key`);--> statement-breakpoint
CREATE INDEX `competition_rounds_event_position_idx` ON `competition_rounds` (`event_id`,`position`);--> statement-breakpoint
CREATE TABLE `competition_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_id` text NOT NULL,
	`singer_id` text NOT NULL,
	`judge_id` text NOT NULL,
	`dimensions_json` text DEFAULT '[]' NOT NULL,
	`total_score` real DEFAULT 0 NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_id`) REFERENCES `competition_rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`singer_id`) REFERENCES `competition_singers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`judge_id`) REFERENCES `competition_judges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_scores_round_singer_judge_unique` ON `competition_scores` (`round_id`,`singer_id`,`judge_id`);--> statement-breakpoint
CREATE INDEX `competition_scores_event_idx` ON `competition_scores` (`event_id`);--> statement-breakpoint
CREATE INDEX `competition_scores_round_idx` ON `competition_scores` (`round_id`);--> statement-breakpoint
CREATE TABLE `competition_singers` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`song` text NOT NULL,
	`class_name` text,
	`remark` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competition_singers_event_order_idx` ON `competition_singers` (`event_id`,`sort_order`);