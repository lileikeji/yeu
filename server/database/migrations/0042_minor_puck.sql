ALTER TABLE `place_reviews` ADD `track_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `place_reviews_track_code_unique` ON `place_reviews` (`track_code`);