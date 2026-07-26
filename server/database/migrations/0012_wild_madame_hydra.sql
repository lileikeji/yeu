CREATE TABLE `organization_admin_scopes` (
	`admin_user_id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_admin_scopes_content_unique` ON `organization_admin_scopes` (`content_id`);--> statement-breakpoint
CREATE INDEX `organization_admin_scopes_creator_idx` ON `organization_admin_scopes` (`created_by_admin_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'super' NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "admin_users_role_check" CHECK("__new_admin_users"."role" in ('super', 'organization'))
);
--> statement-breakpoint
INSERT INTO `__new_admin_users`("id", "username", "password_hash", "display_name", "role", "must_change_password", "is_active", "last_login_at", "created_at", "updated_at") SELECT "id", "username", "password_hash", "display_name", 'super', false, "is_active", "last_login_at", "created_at", "updated_at" FROM `admin_users`;--> statement-breakpoint
DROP TABLE `admin_users`;--> statement-breakpoint
ALTER TABLE `__new_admin_users` RENAME TO `admin_users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_username_unique` ON `admin_users` (`username`);--> statement-breakpoint
CREATE INDEX `admin_users_role_active_idx` ON `admin_users` (`role`,`is_active`);
