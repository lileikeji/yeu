-- 活动留言：与地点留言分表。一个活动结束后留言仍应跟着活动，不能复用
-- place_moments 的 place_id 分区。images 存最多 3 个上传 URL，第一张展示在列表。
CREATE TABLE `activity_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`user_id` text,
	`anonymous_key` text,
	`body` text DEFAULT '' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`ip` text,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `activity_comments_status_check` CHECK(`status` in ('approved', 'hidden'))
);
--> statement-breakpoint
CREATE INDEX `activity_comments_activity_created_idx` ON `activity_comments` (`activity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_comments_status_created_idx` ON `activity_comments` (`status`,`created_at`);
