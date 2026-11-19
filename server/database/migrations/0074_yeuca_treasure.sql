CREATE TABLE `yeuca_treasure_config` (
  `id` text PRIMARY KEY NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `title` text DEFAULT '仰恩校园实景寻宝 · 计协联合集章' NOT NULL,
  `subtitle` text DEFAULT '到指定地标半径内定位并核对现场暗号，或试玩探索全校点位。' NOT NULL,
  `goal_count` integer DEFAULT 5 NOT NULL,
  `require_member` integer DEFAULT 0 NOT NULL,
  `updated_by_admin_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`updated_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `yeuca_treasure_points` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `alias` text DEFAULT '' NOT NULL,
  `kind` text DEFAULT 'chest' NOT NULL,
  `dept_name` text DEFAULT '协会全体' NOT NULL,
  `landmark` text NOT NULL,
  `room` text DEFAULT '' NOT NULL,
  `region` text DEFAULT 'new' NOT NULL,
  `lng` real NOT NULL,
  `lat` real NOT NULL,
  `radius_meters` integer DEFAULT 20 NOT NULL,
  `verify_mode` text DEFAULT 'gps_answer' NOT NULL,
  `clue` text NOT NULL,
  `question` text DEFAULT '' NOT NULL,
  `answer` text DEFAULT '' NOT NULL,
  `character_key` text DEFAULT '' NOT NULL,
  `glyph` text DEFAULT '' NOT NULL,
  `sort_order` integer DEFAULT 100 NOT NULL,
  `is_published` integer DEFAULT 1 NOT NULL,
  `created_by_admin_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `yeuca_treasure_points_dept_idx` ON `yeuca_treasure_points` (`dept_name`);
--> statement-breakpoint
CREATE INDEX `yeuca_treasure_points_pub_idx` ON `yeuca_treasure_points` (`is_published`, `sort_order`);
--> statement-breakpoint
CREATE TABLE `yeuca_treasure_stamps` (
  `id` text PRIMARY KEY NOT NULL,
  `point_id` text NOT NULL,
  `actor_type` text NOT NULL,
  `actor_id` text NOT NULL,
  `actor_label` text DEFAULT '' NOT NULL,
  `verify_mode` text DEFAULT 'gps_answer' NOT NULL,
  `distance_meters` real,
  `lng` real,
  `lat` real,
  `accuracy` real,
  `collected_at` integer NOT NULL,
  FOREIGN KEY (`point_id`) REFERENCES `yeuca_treasure_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yeuca_treasure_stamps_actor_point_unique` ON `yeuca_treasure_stamps` (`actor_type`, `actor_id`, `point_id`);
--> statement-breakpoint
CREATE INDEX `yeuca_treasure_stamps_point_idx` ON `yeuca_treasure_stamps` (`point_id`);
--> statement-breakpoint
CREATE INDEX `yeuca_treasure_stamps_collected_idx` ON `yeuca_treasure_stamps` (`collected_at`);
