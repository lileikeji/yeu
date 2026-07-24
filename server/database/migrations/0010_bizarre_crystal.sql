CREATE TABLE `assistant_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`query_hash` text NOT NULL,
	`query` text NOT NULL,
	`mode` text NOT NULL,
	`retrieval_path` text NOT NULL,
	`used_web_search` integer DEFAULT false NOT NULL,
	`cache_hit` integer DEFAULT false NOT NULL,
	`success` integer DEFAULT true NOT NULL,
	`error_code` text,
	`analysis_ms` integer DEFAULT 0 NOT NULL,
	`feature_api_ms` integer DEFAULT 0 NOT NULL,
	`database_ms` integer DEFAULT 0 NOT NULL,
	`web_cache_ms` integer DEFAULT 0 NOT NULL,
	`web_search_ms` integer DEFAULT 0 NOT NULL,
	`answer_ms` integer DEFAULT 0 NOT NULL,
	`total_ms` integer DEFAULT 0 NOT NULL,
	`citation_count` integer DEFAULT 0 NOT NULL,
	`ip_address` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "assistant_runs_mode_check" CHECK("assistant_runs"."mode" in ('local', 'ai', 'error')),
	CONSTRAINT "assistant_runs_path_check" CHECK("assistant_runs"."retrieval_path" in ('feature_api', 'local_database', 'answer_cache', 'web_cache', 'web_search', 'error'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_runs_request_unique` ON `assistant_runs` (`request_id`);--> statement-breakpoint
CREATE INDEX `assistant_runs_created_idx` ON `assistant_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `assistant_runs_path_created_idx` ON `assistant_runs` (`retrieval_path`,`created_at`);--> statement-breakpoint
CREATE INDEX `assistant_runs_success_created_idx` ON `assistant_runs` (`success`,`created_at`);