-- yeu:allow-table-rebuild competition_rounds
-- 决赛拆成两轮：final（第一轮，取前六）+ final2（第二轮，只让前六唱第二首）。
-- SQLite 改不了 CHECK，只能重建 competition_rounds；重建期间 DROP 父表会按
-- ON DELETE cascade 清空子表，所以先把子表数据备份到 TEMP 表，重建后按依赖顺序灌回。
CREATE TEMP TABLE `__backup_competition_judges` AS SELECT * FROM `competition_judges`;
--> statement-breakpoint
CREATE TEMP TABLE `__backup_competition_judge_sessions` AS SELECT * FROM `competition_judge_sessions`;
--> statement-breakpoint
CREATE TEMP TABLE `__backup_competition_round_entries` AS SELECT * FROM `competition_round_entries`;
--> statement-breakpoint
CREATE TEMP TABLE `__backup_competition_scores` AS SELECT * FROM `competition_scores`;
--> statement-breakpoint
CREATE TABLE `__new_competition_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`judge_count` integer DEFAULT 5 NOT NULL,
	`advance_count` integer,
	`roster_confirmed_at` integer,
	`result_query_open` integer DEFAULT 0 NOT NULL,
	`score_precision` text DEFAULT 'integer' NOT NULL,
	`dimensions_json` text,
	`dimension_max` integer,
	`trim_extremes` integer,
	`current_entry_id` text,
	`sequential_mode` integer DEFAULT 0 NOT NULL,
	`active_day` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_rounds_key_check" CHECK("__new_competition_rounds"."key" in ('prelim', 'semi', 'final', 'final2')),
	CONSTRAINT "competition_rounds_status_check" CHECK("__new_competition_rounds"."status" in ('draft', 'open', 'closed')),
	CONSTRAINT "competition_rounds_judge_count_check" CHECK("__new_competition_rounds"."judge_count" between 1 and 20),
	CONSTRAINT "competition_rounds_advance_count_check" CHECK("__new_competition_rounds"."advance_count" is null or "__new_competition_rounds"."advance_count" between 1 and 500)
);
--> statement-breakpoint
INSERT INTO `__new_competition_rounds`("id", "event_id", "key", "title", "position", "status", "judge_count", "advance_count", "roster_confirmed_at", "result_query_open", "score_precision", "dimensions_json", "dimension_max", "trim_extremes", "current_entry_id", "sequential_mode", "active_day", "created_at", "updated_at") SELECT "id", "event_id", "key", "title", "position", "status", "judge_count", "advance_count", "roster_confirmed_at", "result_query_open", "score_precision", "dimensions_json", "dimension_max", "trim_extremes", "current_entry_id", "sequential_mode", "active_day", "created_at", "updated_at" FROM `competition_rounds`;
--> statement-breakpoint
DROP TABLE `competition_rounds`;
--> statement-breakpoint
ALTER TABLE `__new_competition_rounds` RENAME TO `competition_rounds`;
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_rounds_event_key_unique` ON `competition_rounds` (`event_id`,`key`);
--> statement-breakpoint
CREATE INDEX `competition_rounds_event_position_idx` ON `competition_rounds` (`event_id`,`position`);
--> statement-breakpoint
INSERT INTO `competition_judges`("id", "event_id", "round_id", "username", "password_hash", "display_name", "is_active", "day", "last_login_at", "created_at", "updated_at") SELECT "id", "event_id", "round_id", "username", "password_hash", "display_name", "is_active", "day", "last_login_at", "created_at", "updated_at" FROM `__backup_competition_judges`;
--> statement-breakpoint
INSERT INTO `competition_judge_sessions`("id", "judge_id", "token_hash", "csrf_token_hash", "expires_at", "last_seen_at", "created_at") SELECT "id", "judge_id", "token_hash", "csrf_token_hash", "expires_at", "last_seen_at", "created_at" FROM `__backup_competition_judge_sessions`;
--> statement-breakpoint
INSERT INTO `competition_round_entries`("id", "round_id", "singer_id", "sort_order", "advanced_from_rank", "contest_day", "checked_in_at", "song", "accompaniment_url", "accompaniment_name", "accompaniment_size", "accompaniment_updated_at", "original_url", "original_name", "original_size", "advanced", "created_at") SELECT "id", "round_id", "singer_id", "sort_order", "advanced_from_rank", "contest_day", "checked_in_at", "song", "accompaniment_url", "accompaniment_name", "accompaniment_size", "accompaniment_updated_at", "original_url", "original_name", "original_size", "advanced", "created_at" FROM `__backup_competition_round_entries`;
--> statement-breakpoint
INSERT INTO `competition_scores`("id", "event_id", "round_id", "singer_id", "judge_id", "dimensions_json", "total_score", "comment", "created_at", "updated_at") SELECT "id", "event_id", "round_id", "singer_id", "judge_id", "dimensions_json", "total_score", "comment", "created_at", "updated_at" FROM `__backup_competition_scores`;
--> statement-breakpoint
DROP TABLE `__backup_competition_judges`;
--> statement-breakpoint
DROP TABLE `__backup_competition_judge_sessions`;
--> statement-breakpoint
DROP TABLE `__backup_competition_round_entries`;
--> statement-breakpoint
DROP TABLE `__backup_competition_scores`;
--> statement-breakpoint
CREATE TABLE `competition_final_songs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`singer_id` text NOT NULL,
	`slot` integer NOT NULL,
	`song` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`singer_id`) REFERENCES `competition_singers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_final_songs_slot_check" CHECK(`slot` in (1, 2))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_final_songs_event_singer_slot_unique` ON `competition_final_songs` (`event_id`,`singer_id`,`slot`);
--> statement-breakpoint
CREATE INDEX `competition_final_songs_event_idx` ON `competition_final_songs` (`event_id`);
