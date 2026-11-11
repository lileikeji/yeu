CREATE TABLE `competition_email_images` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`byte_size` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competition_email_images_event_idx` ON `competition_email_images` (`event_id`);
