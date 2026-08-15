CREATE TABLE `assistant_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`content` text NOT NULL,
	`text_hash` text NOT NULL,
	`embedding` blob NOT NULL,
	`model` text NOT NULL,
	`dimension` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'site' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "assistant_embeddings_source_type_check" CHECK("assistant_embeddings"."source_type" in ('entry', 'claim', 'document', 'place', 'content', 'procedure', 'memory')),
	CONSTRAINT "assistant_embeddings_dimension_check" CHECK("assistant_embeddings"."dimension" between 1 and 4096)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_embeddings_source_unique` ON `assistant_embeddings` (`source_type`,`source_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `assistant_embeddings_source_idx` ON `assistant_embeddings` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `assistant_embeddings_updated_idx` ON `assistant_embeddings` (`updated_at`);