CREATE TABLE `competition_email_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`singer_id` text,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`singer_id`) REFERENCES `competition_singers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_email_sends_round_check" CHECK("competition_email_sends"."round_key" in ('prelim', 'semi', 'final')),
	CONSTRAINT "competition_email_sends_status_check" CHECK("competition_email_sends"."status" in ('sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `competition_email_sends_event_round_idx` ON `competition_email_sends` (`event_id`,`round_key`);--> statement-breakpoint
CREATE INDEX `competition_email_sends_singer_idx` ON `competition_email_sends` (`singer_id`);--> statement-breakpoint
CREATE TABLE `competition_email_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`round_key` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_email_templates_round_check" CHECK("competition_email_templates"."round_key" in ('prelim', 'semi', 'final'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_email_templates_event_round_unique` ON `competition_email_templates` (`event_id`,`round_key`);--> statement-breakpoint
ALTER TABLE `competition_events` ADD `registration_open` integer DEFAULT true NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_competition_singers` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`song` text NOT NULL,
	`class_name` text,
	`remark` text,
	`student_no` text,
	`phone` text,
	`email` text,
	`source` text DEFAULT 'admin' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competition_singers_source_check" CHECK("__new_competition_singers"."source" in ('admin', 'form'))
);
--> statement-breakpoint
-- drizzle 生成表重建时把新增列也写进了 SELECT（旧表尚无这些列，执行必报错）；
-- 手工收敛为仅拷贝两表公共列，新增列走默认值（source='admin'，联系方式为 NULL）。
INSERT INTO `__new_competition_singers`("id", "event_id", "name", "song", "class_name", "remark", "sort_order", "created_at", "updated_at") SELECT "id", "event_id", "name", "song", "class_name", "remark", "sort_order", "created_at", "updated_at" FROM `competition_singers`;--> statement-breakpoint
DROP TABLE `competition_singers`;--> statement-breakpoint
ALTER TABLE `__new_competition_singers` RENAME TO `competition_singers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `competition_singers_event_order_idx` ON `competition_singers` (`event_id`,`sort_order`);