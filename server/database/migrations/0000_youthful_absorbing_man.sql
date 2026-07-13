CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_sessions_token_hash_unique` ON `admin_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `admin_sessions_user_idx` ON `admin_sessions` (`admin_user_id`);--> statement-breakpoint
CREATE INDEX `admin_sessions_expires_idx` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_username_unique` ON `admin_users` (`username`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_admin_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`request_id` text,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`actor_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `content_sources` (
	`content_id` text NOT NULL,
	`source_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`content_id`, `source_id`),
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `content_sources_source_idx` ON `content_sources` (`source_id`);--> statement-breakpoint
CREATE TABLE `contents` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`category` text,
	`audience` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`last_verified_at` integer,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "contents_kind_check" CHECK("contents"."kind" in ('guide', 'department', 'club', 'notice')),
	CONSTRAINT "contents_status_check" CHECK("contents"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contents_kind_slug_unique` ON `contents` (`kind`,`slug`);--> statement-breakpoint
CREATE INDEX `contents_public_list_idx` ON `contents` (`status`,`kind`,`is_featured`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`reason_type` text NOT NULL,
	`message` text NOT NULL,
	`evidence_url` text,
	`contact` text,
	`status` text DEFAULT 'new' NOT NULL,
	`resolution_note` text,
	`submitter_ip_hash` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resolved_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "feedback_status_check" CHECK("feedback"."status" in ('new', 'reviewing', 'resolved', 'rejected', 'spam')),
	CONSTRAINT "feedback_target_type_check" CHECK("feedback"."target_type" in ('general', 'place', 'content')),
	CONSTRAINT "feedback_target_id_check" CHECK(("feedback"."target_type" = 'general' and "feedback"."target_id" is null) or ("feedback"."target_type" != 'general' and "feedback"."target_id" is not null))
);
--> statement-breakpoint
CREATE INDEX `feedback_status_created_idx` ON `feedback` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_target_idx` ON `feedback` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `place_sources` (
	`place_id` text NOT NULL,
	`source_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`place_id`, `source_id`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `place_sources_source_idx` ON `place_sources` (`source_id`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`scope` text NOT NULL,
	`type` text NOT NULL,
	`category` text,
	`address` text,
	`campus_area` text,
	`floor` text,
	`room` text,
	`longitude` real NOT NULL,
	`latitude` real NOT NULL,
	`coordinate_system` text NOT NULL,
	`opening_hours` text,
	`phone` text,
	`website` text,
	`external_map_url` text,
	`is_official` integer DEFAULT false NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`last_verified_at` integer,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "places_scope_check" CHECK("places"."scope" in ('campus', 'nearby')),
	CONSTRAINT "places_status_check" CHECK("places"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "places_crs_check" CHECK("places"."coordinate_system" in ('WGS84', 'GCJ-02', 'BD-09')),
	CONSTRAINT "places_longitude_check" CHECK("places"."longitude" between -180 and 180),
	CONSTRAINT "places_latitude_check" CHECK("places"."latitude" between -90 and 90)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `places_slug_unique` ON `places` (`slug`);--> statement-breakpoint
CREATE INDEX `places_public_list_idx` ON `places` (`status`,`scope`,`type`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`category`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`platform` text NOT NULL,
	`publisher_name` text NOT NULL,
	`source_level` text NOT NULL,
	`is_official` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`accessed_at` integer NOT NULL,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "sources_level_check" CHECK("sources"."source_level" in ('A', 'B', 'C', 'D', 'E')),
	CONSTRAINT "sources_status_check" CHECK("sources"."status" in ('active', 'unavailable', 'disputed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_url_unique` ON `sources` (`url`);--> statement-breakpoint
CREATE INDEX `sources_level_status_idx` ON `sources` (`source_level`,`status`);