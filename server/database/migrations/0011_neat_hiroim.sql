CREATE TABLE `frontend_feature_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`updated_by_admin_id` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`updated_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `frontend_feature_settings_enabled_idx` ON `frontend_feature_settings` (`is_enabled`);