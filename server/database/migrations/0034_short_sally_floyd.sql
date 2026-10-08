CREATE TABLE `recruit_referrers` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `recruit_forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruit_referrers_code_unique` ON `recruit_referrers` (`code`);--> statement-breakpoint
CREATE INDEX `recruit_referrers_form_idx` ON `recruit_referrers` (`form_id`);--> statement-breakpoint
ALTER TABLE `recruit_submissions` ADD `referrer_name` text;