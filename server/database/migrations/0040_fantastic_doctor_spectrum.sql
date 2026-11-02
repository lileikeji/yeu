CREATE TABLE `signal_event_items` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`item_kind` text NOT NULL,
	`item_id` text NOT NULL,
	`source_id` text,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`published_at` integer,
	`score` real DEFAULT 0 NOT NULL,
	`score_a` real DEFAULT 0 NOT NULL,
	`score_b` real DEFAULT 0 NOT NULL,
	`tier` text DEFAULT 'C' NOT NULL,
	`similarity` real DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `signal_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "signal_event_items_kind_check" CHECK("signal_event_items"."item_kind" in ('notice', 'document')),
	CONSTRAINT "signal_event_items_tier_check" CHECK("signal_event_items"."tier" in ('A', 'B', 'C'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_event_items_identity_unique` ON `signal_event_items` (`item_kind`,`item_id`);--> statement-breakpoint
CREATE INDEX `signal_event_items_event_idx` ON `signal_event_items` (`event_id`);--> statement-breakpoint
CREATE INDEX `signal_event_items_source_idx` ON `signal_event_items` (`source_id`);--> statement-breakpoint
CREATE TABLE `signal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'campus' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`heat` real DEFAULT 0 NOT NULL,
	`heat_prev` real DEFAULT 0 NOT NULL,
	`trend` text DEFAULT 'flat' NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`tier` text DEFAULT 'C' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`reported_at` integer,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "signal_events_status_check" CHECK("signal_events"."status" in ('published', 'archived')),
	CONSTRAINT "signal_events_trend_check" CHECK("signal_events"."trend" in ('new', 'up', 'down', 'flat')),
	CONSTRAINT "signal_events_tier_check" CHECK("signal_events"."tier" in ('A', 'B', 'C'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_events_slug_unique` ON `signal_events` (`slug`);--> statement-breakpoint
CREATE INDEX `signal_events_status_heat_idx` ON `signal_events` (`status`,`heat`);--> statement-breakpoint
CREATE INDEX `signal_events_last_seen_idx` ON `signal_events` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `signal_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`period_key` text NOT NULL,
	`title` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`generated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "signal_reports_kind_check" CHECK("signal_reports"."kind" in ('daily', 'weekly', 'monthly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_reports_period_unique` ON `signal_reports` (`kind`,`period_key`);--> statement-breakpoint
CREATE INDEX `signal_reports_kind_generated_idx` ON `signal_reports` (`kind`,`generated_at`);