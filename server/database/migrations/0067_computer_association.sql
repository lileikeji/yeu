CREATE TABLE `yeuca_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`kind` text DEFAULT 'news' NOT NULL,
	`dept_name` text DEFAULT 'AI 部' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "yeuca_posts_kind_check" CHECK("yeuca_posts"."kind" in ('news', 'resource')),
	CONSTRAINT "yeuca_posts_status_check" CHECK("yeuca_posts"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yeuca_posts_slug_unique` ON `yeuca_posts` (`slug`);--> statement-breakpoint
CREATE INDEX `yeuca_posts_kind_status_idx` ON `yeuca_posts` (`kind`,`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `yeuca_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`dept_name` text DEFAULT 'AI 部' NOT NULL,
	`track` text DEFAULT 'AI / Agent' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`summary` text NOT NULL,
	`highlights_json` text DEFAULT '[]' NOT NULL,
	`stack_json` text DEFAULT '[]' NOT NULL,
	`preview_image` text DEFAULT '' NOT NULL,
	`repo_url` text DEFAULT '' NOT NULL,
	`demo_url` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "yeuca_projects_status_check" CHECK("yeuca_projects"."status" in ('active', 'maintaining', 'planning'))
);
--> statement-breakpoint
CREATE INDEX `yeuca_projects_pub_order_idx` ON `yeuca_projects` (`is_published`,`sort_order`);--> statement-breakpoint
CREATE TABLE `yeuca_site_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`campus` text DEFAULT '福建泉州 · 仰恩大学洛江校区' NOT NULL,
	`tagline` text NOT NULL,
	`intro` text NOT NULL,
	`recruit_note` text DEFAULT '' NOT NULL,
	`contact_note` text DEFAULT '' NOT NULL,
	`group_qr_url` text DEFAULT '' NOT NULL,
	`departments_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yeuca_site_settings_content_unique` ON `yeuca_site_settings` (`content_id`);
