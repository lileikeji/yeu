CREATE TABLE `yeuca_members` (
	`id` text PRIMARY KEY NOT NULL,
	`student_no` text NOT NULL,
	`name` text NOT NULL,
	`grade_major_class` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`role_title` text DEFAULT '会员' NOT NULL,
	`term` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`qq` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`git_username` text DEFAULT '' NOT NULL,
	`git_user_id` integer,
	`git_synced` integer DEFAULT false NOT NULL,
	`git_sync_error` text DEFAULT '' NOT NULL,
	`member_status` text DEFAULT 'pending' NOT NULL,
	`password_hash` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`skills_json` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recruit_submission_id` text,
	`registered_at` integer,
	`last_login_at` integer,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "yeuca_members_status_check" CHECK("yeuca_members"."member_status" in ('pending', 'active', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yeuca_members_student_no_unique` ON `yeuca_members` (`student_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `yeuca_members_git_username_unique` ON `yeuca_members` (`git_username`) WHERE `git_username` != '';--> statement-breakpoint
CREATE INDEX `yeuca_members_status_dept_idx` ON `yeuca_members` (`member_status`,`department`);--> statement-breakpoint
CREATE TABLE `yeuca_member_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `yeuca_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yeuca_member_sessions_token_unique` ON `yeuca_member_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `yeuca_member_sessions_member_idx` ON `yeuca_member_sessions` (`member_id`);--> statement-breakpoint
CREATE INDEX `yeuca_member_sessions_expires_idx` ON `yeuca_member_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `yeuca_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`dept_name` text DEFAULT '协会全体' NOT NULL,
	`category` text DEFAULT '技术培训' NOT NULL,
	`summary` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`place_name` text DEFAULT '校内场地 / 群内通知' NOT NULL,
	`room` text DEFAULT '' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`allow_registration` integer DEFAULT true NOT NULL,
	`max_participants` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`photos_json` text DEFAULT '[]' NOT NULL,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "yeuca_activities_status_check" CHECK("yeuca_activities"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yeuca_activities_slug_unique` ON `yeuca_activities` (`slug`);--> statement-breakpoint
CREATE INDEX `yeuca_activities_status_start_idx` ON `yeuca_activities` (`status`,`starts_at`);--> statement-breakpoint
CREATE TABLE `yeuca_activity_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text DEFAULT 'registered' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`checked_in_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `yeuca_activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `yeuca_members`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "yeuca_activity_reg_status_check" CHECK("yeuca_activity_registrations"."status" in ('registered', 'checked_in', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yeuca_activity_reg_unique` ON `yeuca_activity_registrations` (`activity_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `yeuca_activity_reg_member_idx` ON `yeuca_activity_registrations` (`member_id`);
