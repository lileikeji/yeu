PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_place_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`user_id` text,
	`anonymous_key` text,
	`score` integer NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_admin_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "place_reviews_score_check" CHECK("__new_place_reviews"."score" between 1 and 5),
	CONSTRAINT "place_reviews_status_check" CHECK("__new_place_reviews"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_place_reviews`("id", "place_id", "user_id", "score", "content", "status", "reviewed_by_admin_id", "reviewed_at", "review_note", "created_at", "updated_at") SELECT "id", "place_id", "user_id", "score", "content", "status", "reviewed_by_admin_id", "reviewed_at", "review_note", "created_at", "updated_at" FROM `place_reviews`;--> statement-breakpoint
DROP TABLE `place_reviews`;--> statement-breakpoint
ALTER TABLE `__new_place_reviews` RENAME TO `place_reviews`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `place_reviews_user_place_unique` ON `place_reviews` (`user_id`,`place_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `place_reviews_anon_place_unique` ON `place_reviews` (`anonymous_key`,`place_id`);--> statement-breakpoint
CREATE INDEX `place_reviews_place_status_idx` ON `place_reviews` (`place_id`,`status`);--> statement-breakpoint
CREATE INDEX `place_reviews_status_created_idx` ON `place_reviews` (`status`,`created_at`);