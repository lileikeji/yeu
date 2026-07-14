CREATE TABLE `__new_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`reason_type` text NOT NULL,
	`message` text NOT NULL,
	`evidence_url` text,
	`page_url` text,
	`contact` text,
	`status` text DEFAULT 'new' NOT NULL,
	`resolution_note` text,
	`submitter_ip_hash` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resolved_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "feedback_status_check" CHECK("__new_feedback"."status" in ('new', 'reviewing', 'resolved', 'rejected', 'spam')),
	CONSTRAINT "feedback_target_type_check" CHECK("__new_feedback"."target_type" in ('general', 'place', 'content', 'procedure')),
	CONSTRAINT "feedback_target_id_check" CHECK(("__new_feedback"."target_type" = 'general' and "__new_feedback"."target_id" is null) or ("__new_feedback"."target_type" != 'general' and "__new_feedback"."target_id" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_feedback`("id", "target_type", "target_id", "reason_type", "message", "evidence_url", "page_url", "contact", "status", "resolution_note", "submitter_ip_hash", "resolved_by", "resolved_at", "created_at", "updated_at") SELECT "id", "target_type", "target_id", "reason_type", "message", "evidence_url", NULL, "contact", "status", "resolution_note", "submitter_ip_hash", "resolved_by", "resolved_at", "created_at", "updated_at" FROM `feedback`;--> statement-breakpoint
DROP TABLE `feedback`;--> statement-breakpoint
ALTER TABLE `__new_feedback` RENAME TO `feedback`;--> statement-breakpoint
CREATE INDEX `feedback_status_created_idx` ON `feedback` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_target_idx` ON `feedback` (`target_type`,`target_id`);
