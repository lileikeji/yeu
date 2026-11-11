-- 社团/部门活动：组织后台创建，总管理员审核后公开。
-- 不塞进 contents：kind 是封闭枚举，而且内容发布强制要求来源与核验时间，
-- 与“某天在某间教室办活动”的模型不匹配。组织身份仍用 contents 外键。
CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`organization_content_id` text NOT NULL,
	`place_id` text,
	`room` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`photos_json` text DEFAULT '[]' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_note` text,
	`published_at` integer,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `activities_status_check` CHECK(`status` in ('draft', 'pending', 'published', 'rejected', 'archived')),
  CONSTRAINT `activities_time_check` CHECK(`ends_at` is null or `ends_at` >= `starts_at`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_slug_unique` ON `activities` (`slug`);--> statement-breakpoint
CREATE INDEX `activities_org_status_idx` ON `activities` (`organization_content_id`,`status`);--> statement-breakpoint
CREATE INDEX `activities_place_status_idx` ON `activities` (`place_id`,`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `activities_public_idx` ON `activities` (`status`,`starts_at`);
