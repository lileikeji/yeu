CREATE TABLE `recruit_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`draft_key` text NOT NULL,
	`data_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `recruit_forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruit_drafts_form_key_unique` ON `recruit_drafts` (`form_id`,`draft_key`);