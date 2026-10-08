CREATE TABLE `recruit_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`title` text DEFAULT '入会申请表' NOT NULL,
	`slogan` text DEFAULT '' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`fields_json` text DEFAULT '[]' NOT NULL,
	`doc_config_json` text DEFAULT '{}' NOT NULL,
	`export_columns_json` text DEFAULT '[]' NOT NULL,
	`template_docx` text,
	`template_name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruit_forms_content_unique` ON `recruit_forms` (`content_id`);--> statement-breakpoint
CREATE TABLE `recruit_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`data_json` text DEFAULT '{}' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`gender` text,
	`student_no` text,
	`major` text,
	`class_name` text,
	`phone` text,
	`qq` text,
	`departments` text,
	`is_league_member` text,
	`submit_ip_hash` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `recruit_forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recruit_submissions_form_created_idx` ON `recruit_submissions` (`form_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `recruit_submissions_class_idx` ON `recruit_submissions` (`class_name`);