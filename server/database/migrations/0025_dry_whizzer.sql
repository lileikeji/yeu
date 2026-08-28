CREATE TABLE `place_amap_ratings` (
	`place_id` text PRIMARY KEY NOT NULL,
	`amap_poi_id` text NOT NULL,
	`amap_poi_name` text NOT NULL,
	`score` real,
	`cost` real,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "place_amap_ratings_score_check" CHECK("place_amap_ratings"."score" is null or "place_amap_ratings"."score" between 0 and 5),
	CONSTRAINT "place_amap_ratings_cost_check" CHECK("place_amap_ratings"."cost" is null or "place_amap_ratings"."cost" >= 0)
);
--> statement-breakpoint
CREATE INDEX `place_amap_ratings_expiry_idx` ON `place_amap_ratings` (`expires_at`);--> statement-breakpoint
CREATE TABLE `place_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`user_id` text NOT NULL,
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
	CONSTRAINT "place_reviews_score_check" CHECK("place_reviews"."score" between 1 and 5),
	CONSTRAINT "place_reviews_status_check" CHECK("place_reviews"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `place_reviews_user_place_unique` ON `place_reviews` (`user_id`,`place_id`);--> statement-breakpoint
CREATE INDEX `place_reviews_place_status_idx` ON `place_reviews` (`place_id`,`status`);--> statement-breakpoint
CREATE INDEX `place_reviews_status_created_idx` ON `place_reviews` (`status`,`created_at`);