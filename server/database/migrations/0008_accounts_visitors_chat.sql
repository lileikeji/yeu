CREATE TABLE `visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`last_ip` text,
	`last_country` text,
	`last_region` text,
	`last_city` text,
	`last_user_agent` text,
	`last_path` text,
	`event_count` integer DEFAULT 0 NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `visitors_last_seen_idx` ON `visitors` (`last_seen_at`);
--> statement-breakpoint
CREATE INDEX `visitors_last_ip_idx` ON `visitors` (`last_ip`);
--> statement-breakpoint
CREATE INDEX `visitors_user_idx` ON `visitors` (`user_id`);
--> statement-breakpoint
CREATE TABLE `visitor_events` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`user_id` text,
	`ip` text,
	`country` text,
	`region` text,
	`city` text,
	`user_agent` text,
	`path` text,
	`method` text,
	`action` text NOT NULL,
	`meta_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `visitor_events_visitor_created_idx` ON `visitor_events` (`visitor_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `visitor_events_action_created_idx` ON `visitor_events` (`action`,`created_at`);
--> statement-breakpoint
CREATE INDEX `visitor_events_ip_created_idx` ON `visitor_events` (`ip`,`created_at`);
--> statement-breakpoint
CREATE INDEX `visitor_events_created_idx` ON `visitor_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE `visitor_bans` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`value` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`banned_by_admin_id` text,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`banned_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `visitor_bans_scope_value_idx` ON `visitor_bans` (`scope`,`value`);
--> statement-breakpoint
CREATE INDEX `visitor_bans_active_idx` ON `visitor_bans` (`is_active`);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`major` text,
	`dorm_building` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_admin_id` text,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);
--> statement-breakpoint
CREATE INDEX `users_dorm_idx` ON `users` (`dorm_building`);
--> statement-breakpoint
CREATE INDEX `users_major_idx` ON `users` (`major`);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_sessions_token_hash_unique` ON `user_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `user_sessions_user_idx` ON `user_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `user_sessions_expires_idx` ON `user_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`dorm_building` text,
	`is_muted_all` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_rooms_slug_unique` ON `chat_rooms` (`slug`);
--> statement-breakpoint
CREATE INDEX `chat_rooms_kind_idx` ON `chat_rooms` (`kind`);
--> statement-breakpoint
CREATE INDEX `chat_rooms_dorm_idx` ON `chat_rooms` (`dorm_building`);
--> statement-breakpoint
CREATE TABLE `chat_members` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	`last_read_at` integer,
	PRIMARY KEY(`room_id`, `user_id`),
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_members_user_idx` ON `chat_members` (`user_id`);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`body` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_room_created_idx` ON `chat_messages` (`room_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `chat_messages_user_created_idx` ON `chat_messages` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `chat_mutes` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text,
	`user_id` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`muted_by_admin_id` text,
	`expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`muted_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_mutes_user_active_idx` ON `chat_mutes` (`user_id`,`is_active`);
--> statement-breakpoint
CREATE INDEX `chat_mutes_room_user_idx` ON `chat_mutes` (`room_id`,`user_id`);
--> statement-breakpoint
INSERT INTO `chat_rooms` (`id`, `kind`, `slug`, `title`, `dorm_building`, `is_muted_all`, `is_active`, `created_at`, `updated_at`)
VALUES ('00000000-0000-4000-8000-000000000001', 'public', 'public', '公共群聊', NULL, 0, 1, (unixepoch() * 1000), (unixepoch() * 1000));
