CREATE TABLE `knowledge_claim_entities` (
	`claim_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`role` text DEFAULT 'mentioned' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`claim_id`, `entity_id`, `role`),
	FOREIGN KEY (`claim_id`) REFERENCES `knowledge_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `knowledge_entities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "knowledge_claim_entities_role_check" CHECK("knowledge_claim_entities"."role" in ('subject', 'object', 'mentioned'))
);
--> statement-breakpoint
CREATE INDEX `knowledge_claim_entities_entity_idx` ON `knowledge_claim_entities` (`entity_id`,`role`);--> statement-breakpoint
CREATE TABLE `knowledge_claim_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`source_id` text,
	`document_id` text,
	`evidence_quote` text DEFAULT '' NOT NULL,
	`locator` text DEFAULT '' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `knowledge_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_id`) REFERENCES `knowledge_documents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "knowledge_claim_sources_reference_check" CHECK("knowledge_claim_sources"."source_id" is not null or "knowledge_claim_sources"."document_id" is not null)
);
--> statement-breakpoint
CREATE INDEX `knowledge_claim_sources_claim_idx` ON `knowledge_claim_sources` (`claim_id`,`is_primary`);--> statement-breakpoint
CREATE INDEX `knowledge_claim_sources_source_idx` ON `knowledge_claim_sources` (`source_id`);--> statement-breakpoint
CREATE INDEX `knowledge_claim_sources_document_idx` ON `knowledge_claim_sources` (`document_id`);--> statement-breakpoint
CREATE TABLE `knowledge_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`statement` text NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`confidence_label` text DEFAULT 'unverified' NOT NULL,
	`confidence_score` integer DEFAULT 50 NOT NULL,
	`review_status` text DEFAULT 'draft' NOT NULL,
	`public_url` text,
	`source_note` text DEFAULT '' NOT NULL,
	`valid_from` integer,
	`valid_until` integer,
	`published_at` integer,
	`reviewed_at` integer,
	`reviewed_by_admin_id` text,
	`created_by_admin_id` text,
	`supersedes_claim_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supersedes_claim_id`) REFERENCES `knowledge_claims`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "knowledge_claims_confidence_label_check" CHECK("knowledge_claims"."confidence_label" in ('extracted', 'inferred', 'ambiguous', 'unverified')),
	CONSTRAINT "knowledge_claims_confidence_score_check" CHECK("knowledge_claims"."confidence_score" between 0 and 100),
	CONSTRAINT "knowledge_claims_review_status_check" CHECK("knowledge_claims"."review_status" in ('draft', 'review', 'published', 'rejected', 'archived')),
	CONSTRAINT "knowledge_claims_valid_range_check" CHECK("knowledge_claims"."valid_until" is null or "knowledge_claims"."valid_from" is null or "knowledge_claims"."valid_until" >= "knowledge_claims"."valid_from"),
	CONSTRAINT "knowledge_claims_published_at_check" CHECK("knowledge_claims"."review_status" <> 'published' or "knowledge_claims"."published_at" is not null)
);
--> statement-breakpoint
CREATE INDEX `knowledge_claims_review_category_idx` ON `knowledge_claims` (`review_status`,`category`);--> statement-breakpoint
CREATE INDEX `knowledge_claims_validity_idx` ON `knowledge_claims` (`review_status`,`valid_from`,`valid_until`);--> statement-breakpoint
CREATE TABLE `knowledge_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`left_claim_id` text NOT NULL,
	`right_claim_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution_note` text DEFAULT '' NOT NULL,
	`resolved_at` integer,
	`resolved_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`left_claim_id`) REFERENCES `knowledge_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`right_claim_id`) REFERENCES `knowledge_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "knowledge_conflicts_status_check" CHECK("knowledge_conflicts"."status" in ('open', 'resolved', 'dismissed')),
	CONSTRAINT "knowledge_conflicts_distinct_claims_check" CHECK("knowledge_conflicts"."left_claim_id" <> "knowledge_conflicts"."right_claim_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_conflicts_pair_unique` ON `knowledge_conflicts` (`left_claim_id`,`right_claim_id`);--> statement-breakpoint
CREATE INDEX `knowledge_conflicts_status_idx` ON `knowledge_conflicts` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`original_url` text,
	`storage_path` text,
	`mime_type` text,
	`content_hash` text NOT NULL,
	`extracted_text` text DEFAULT '' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'imported' NOT NULL,
	`captured_at` integer NOT NULL,
	`processed_at` integer,
	`created_by_admin_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "knowledge_documents_kind_check" CHECK("knowledge_documents"."kind" in ('webpage', 'pdf', 'document', 'spreadsheet', 'chat_export', 'manual', 'api')),
	CONSTRAINT "knowledge_documents_status_check" CHECK("knowledge_documents"."status" in ('imported', 'processing', 'ready', 'failed', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_documents_hash_unique` ON `knowledge_documents` (`content_hash`);--> statement-breakpoint
CREATE INDEX `knowledge_documents_status_captured_idx` ON `knowledge_documents` (`status`,`captured_at`);--> statement-breakpoint
CREATE INDEX `knowledge_documents_source_idx` ON `knowledge_documents` (`source_id`);--> statement-breakpoint
CREATE TABLE `knowledge_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`canonical_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`merged_into_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`merged_into_id`) REFERENCES `knowledge_entities`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "knowledge_entities_type_check" CHECK("knowledge_entities"."entity_type" in ('person', 'major', 'college', 'place', 'policy', 'procedure', 'organization', 'term', 'other')),
	CONSTRAINT "knowledge_entities_status_check" CHECK("knowledge_entities"."status" in ('active', 'merged', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_entities_type_name_unique` ON `knowledge_entities` (`entity_type`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `knowledge_entities_status_type_idx` ON `knowledge_entities` (`status`,`entity_type`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `knowledge_claims_fts` USING fts5(
	`claim_id` UNINDEXED,
	`title`,
	`statement`,
	`search_text`,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `knowledge_claims_fts_insert` AFTER INSERT ON `knowledge_claims` BEGIN
	INSERT INTO `knowledge_claims_fts` (`claim_id`, `title`, `statement`, `search_text`)
	VALUES (new.`id`, new.`title`, new.`statement`, new.`search_text`);
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_claims_fts_update` AFTER UPDATE OF `title`, `statement`, `search_text` ON `knowledge_claims` BEGIN
	DELETE FROM `knowledge_claims_fts` WHERE `claim_id` = old.`id`;
	INSERT INTO `knowledge_claims_fts` (`claim_id`, `title`, `statement`, `search_text`)
	VALUES (new.`id`, new.`title`, new.`statement`, new.`search_text`);
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_claims_fts_delete` AFTER DELETE ON `knowledge_claims` BEGIN
	DELETE FROM `knowledge_claims_fts` WHERE `claim_id` = old.`id`;
END;
