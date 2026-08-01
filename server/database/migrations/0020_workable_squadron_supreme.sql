CREATE TABLE `assistant_answer_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`cache_key` text NOT NULL,
	`query` text NOT NULL,
	`response_json` text NOT NULL,
	`knowledge_revision` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_answer_cache_key_unique` ON `assistant_answer_cache` (`cache_key`);--> statement-breakpoint
CREATE INDEX `assistant_answer_cache_expiry_idx` ON `assistant_answer_cache` (`expires_at`);--> statement-breakpoint
CREATE INDEX `assistant_answer_cache_query_idx` ON `assistant_answer_cache` (`query`);
