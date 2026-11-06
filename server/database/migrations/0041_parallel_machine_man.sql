CREATE TABLE `place_moments` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`user_id` text,
	`anonymous_key` text,
	`kind` text DEFAULT 'comment' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`day_key` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "place_moments_kind_check" CHECK("place_moments"."kind" in ('comment', 'checkin')),
	CONSTRAINT "place_moments_status_check" CHECK("place_moments"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `place_moments_place_created_idx` ON `place_moments` (`place_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `place_moments_status_created_idx` ON `place_moments` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `place_moments_checkin_day_unique` ON `place_moments` (`place_id`,`day_key`,`anonymous_key`) WHERE "place_moments"."kind" = 'checkin';