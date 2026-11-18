CREATE TABLE `yeuca_department_admins` (
	`admin_user_id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`department_name` text NOT NULL,
	`title` text DEFAULT '部长' NOT NULL,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `yeuca_dept_admins_content_idx` ON `yeuca_department_admins` (`content_id`);
--> statement-breakpoint
CREATE INDEX `yeuca_dept_admins_dept_idx` ON `yeuca_department_admins` (`department_name`);
