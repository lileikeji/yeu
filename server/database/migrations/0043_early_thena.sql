CREATE TABLE `bus_moments` (
	`id` text PRIMARY KEY NOT NULL,
	`bus_name` text NOT NULL,
	`route_name` text DEFAULT '' NOT NULL,
	`user_id` text,
	`anonymous_key` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bus_moments_status_check" CHECK("bus_moments"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `bus_moments_bus_created_idx` ON `bus_moments` (`bus_name`,`created_at`);--> statement-breakpoint
CREATE INDEX `bus_moments_status_created_idx` ON `bus_moments` (`status`,`created_at`);