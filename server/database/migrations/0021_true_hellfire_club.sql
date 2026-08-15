CREATE TABLE `assistant_session_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`session_key` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`source_query_hash` text NOT NULL,
	`source_query` text NOT NULL,
	`answer_digest` text,
	`importance` integer DEFAULT 50 NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`last_hit_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "assistant_session_memory_kind_check" CHECK("assistant_session_memory"."kind" in ('preference', 'fact', 'answered', 'open_question')),
	CONSTRAINT "assistant_session_memory_importance_check" CHECK("assistant_session_memory"."importance" between 0 and 100)
);
--> statement-breakpoint
CREATE INDEX `assistant_session_memory_session_kind_idx` ON `assistant_session_memory` (`session_key`,`kind`);--> statement-breakpoint
CREATE INDEX `assistant_session_memory_session_hit_idx` ON `assistant_session_memory` (`session_key`,`last_hit_at`);--> statement-breakpoint
CREATE INDEX `assistant_session_memory_expiry_idx` ON `assistant_session_memory` (`expires_at`);