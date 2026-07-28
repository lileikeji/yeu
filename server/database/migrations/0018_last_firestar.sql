CREATE TABLE `knowledge_crawl_queue` (
	`url` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`discovered_from` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`next_attempt_at` integer,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "knowledge_crawl_queue_status_check" CHECK("knowledge_crawl_queue"."status" in ('pending', 'processing', 'completed', 'failed')),
	CONSTRAINT "knowledge_crawl_queue_depth_check" CHECK("knowledge_crawl_queue"."depth" >= 0),
	CONSTRAINT "knowledge_crawl_queue_attempts_check" CHECK("knowledge_crawl_queue"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `knowledge_crawl_queue_status_priority_idx` ON `knowledge_crawl_queue` (`status`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `knowledge_crawl_queue_retry_idx` ON `knowledge_crawl_queue` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `knowledge_crawl_queue_host_idx` ON `knowledge_crawl_queue` (`hostname`,`status`);