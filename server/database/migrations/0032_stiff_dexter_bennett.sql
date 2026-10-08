ALTER TABLE `assistant_runs` ADD `channel` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
CREATE INDEX `assistant_runs_channel_created_idx` ON `assistant_runs` (`channel`,`created_at`);