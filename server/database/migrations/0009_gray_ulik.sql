CREATE TABLE `assistant_web_knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`query_hash` text NOT NULL,
	`query` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`snippet` text NOT NULL,
	`source_host` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "assistant_web_knowledge_status_check" CHECK("assistant_web_knowledge"."status" in ('active', 'expired', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_web_knowledge_query_url_unique` ON `assistant_web_knowledge` (`query_hash`,`url`);
--> statement-breakpoint
CREATE INDEX `assistant_web_knowledge_query_expiry_idx` ON `assistant_web_knowledge` (`query_hash`,`status`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `assistant_web_knowledge_host_idx` ON `assistant_web_knowledge` (`source_host`);
