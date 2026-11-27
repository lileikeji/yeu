CREATE TABLE `competition_popularity_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`page` text DEFAULT 'vote' NOT NULL,
	`source` text DEFAULT 'direct' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`device_brand` text DEFAULT '' NOT NULL,
	`device_model` text DEFAULT '' NOT NULL,
	`os_name` text DEFAULT '' NOT NULL,
	`os_version` text DEFAULT '' NOT NULL,
	`browser_name` text DEFAULT '' NOT NULL,
	`browser_version` text DEFAULT '' NOT NULL,
	`is_wechat` integer DEFAULT 0 NOT NULL,
	`is_bot` integer DEFAULT 0 NOT NULL,
	`has_ticket` integer DEFAULT 0 NOT NULL,
	`visitor_key` text DEFAULT '' NOT NULL,
	`referer` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `competition_popularity_visits_event_created_idx` ON `competition_popularity_visits` (`event_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `competition_popularity_visits_source_created_idx` ON `competition_popularity_visits` (`source`, `created_at`);
--> statement-breakpoint
CREATE INDEX `competition_popularity_visits_visitor_created_idx` ON `competition_popularity_visits` (`visitor_key`, `created_at`);
--> statement-breakpoint
CREATE TABLE `competition_popularity_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`voter_openid_hash` text NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_popularity_follows_event_openid_unique` ON `competition_popularity_follows` (`event_id`, `voter_openid_hash`);
--> statement-breakpoint
CREATE INDEX `competition_popularity_follows_event_created_idx` ON `competition_popularity_follows` (`event_id`, `created_at`);
