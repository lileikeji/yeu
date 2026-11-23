-- 人气奖投票：大屏动态二维码 + 设备一票。
-- 只新建表，不改已有表，因此不需要 allow-table-rebuild 头。
CREATE TABLE `competition_popularity_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`title` text DEFAULT '人气奖投票' NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`opens_at` integer,
	`closes_at` integer,
	`allow_change` integer DEFAULT 0 NOT NULL,
	`max_changes` integer DEFAULT 1 NOT NULL,
	`qr_rotate_seconds` integer DEFAULT 30 NOT NULL,
	`show_results` integer DEFAULT 0 NOT NULL,
	`display_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_popularity_settings_max_changes_check" CHECK(`max_changes` between 0 and 20),
	CONSTRAINT "competition_popularity_settings_qr_rotate_check" CHECK(`qr_rotate_seconds` between 10 and 300)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_settings_event_unique` ON `competition_popularity_settings` (`event_id`);
--> statement-breakpoint
CREATE TABLE `competition_popularity_ballots` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`singer_id` text NOT NULL,
	`device_hash` text NOT NULL,
	`change_count` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`singer_id`) REFERENCES `competition_singers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_ballots_event_device_unique` ON `competition_popularity_ballots` (`event_id`,`device_hash`);
--> statement-breakpoint
CREATE INDEX `competition_popularity_ballots_event_singer_idx` ON `competition_popularity_ballots` (`event_id`,`singer_id`);
