CREATE TABLE `assistant_knowledge_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`public_url` text,
	`confidence` integer DEFAULT 50 NOT NULL,
	`source_note` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`imported_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "assistant_knowledge_kind_check" CHECK("assistant_knowledge_entries"."kind" in ('official_reference', 'campus_template', 'student_experience')),
	CONSTRAINT "assistant_knowledge_confidence_check" CHECK("assistant_knowledge_entries"."confidence" between 0 and 100)
);
--> statement-breakpoint
CREATE INDEX `assistant_knowledge_kind_active_idx` ON `assistant_knowledge_entries` (`kind`,`is_active`);--> statement-breakpoint
CREATE INDEX `assistant_knowledge_category_active_idx` ON `assistant_knowledge_entries` (`category`,`is_active`);