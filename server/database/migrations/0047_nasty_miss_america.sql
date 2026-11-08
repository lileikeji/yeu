CREATE TABLE `competition_pre_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`class_name` text,
	`student_no` text,
	`phone` text,
	`email` text,
	`song` text,
	`registered_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competition_pre_registrations_event_name_idx` ON `competition_pre_registrations` (`event_id`,`name`);--> statement-breakpoint
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
	`pre_registration_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `competition_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pre_registration_id`) REFERENCES `competition_pre_registrations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "competition_singers_source_check" CHECK("__new_competition_singers"."source" in ('admin', 'form', 'pre'))
);
--> statement-breakpoint
-- drizzle 表重建再次把新列写进 SELECT（旧表无 pre_registration_id），收敛为公共列拷贝。
INSERT INTO `__new_competition_singers`("id", "event_id", "name", "song", "class_name", "remark", "student_no", "phone", "email", "source", "sort_order", "created_at", "updated_at") SELECT "id", "event_id", "name", "song", "class_name", "remark", "student_no", "phone", "email", "source", "sort_order", "created_at", "updated_at" FROM `competition_singers`;--> statement-breakpoint
DROP TABLE `competition_singers`;--> statement-breakpoint
ALTER TABLE `__new_competition_singers` RENAME TO `competition_singers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `competition_singers_event_order_idx` ON `competition_singers` (`event_id`,`sort_order`);