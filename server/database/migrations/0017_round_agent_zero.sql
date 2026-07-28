DROP INDEX `knowledge_documents_hash_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_documents_origin_hash_unique` ON `knowledge_documents` (`original_url`,`content_hash`);--> statement-breakpoint
CREATE INDEX `knowledge_documents_hash_idx` ON `knowledge_documents` (`content_hash`);--> statement-breakpoint
CREATE VIRTUAL TABLE `knowledge_documents_fts` USING fts5(
	`document_id` UNINDEXED,
	`title`,
	`extracted_text`,
	tokenize = 'trigram'
);--> statement-breakpoint
INSERT INTO `knowledge_documents_fts` (`document_id`, `title`, `extracted_text`)
SELECT `id`, `title`, `extracted_text` FROM `knowledge_documents`;--> statement-breakpoint
CREATE TRIGGER `knowledge_documents_fts_insert` AFTER INSERT ON `knowledge_documents` BEGIN
	INSERT INTO `knowledge_documents_fts` (`document_id`, `title`, `extracted_text`)
	VALUES (new.`id`, new.`title`, new.`extracted_text`);
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_documents_fts_update` AFTER UPDATE OF `title`, `extracted_text` ON `knowledge_documents` BEGIN
	DELETE FROM `knowledge_documents_fts` WHERE `document_id` = old.`id`;
	INSERT INTO `knowledge_documents_fts` (`document_id`, `title`, `extracted_text`)
	VALUES (new.`id`, new.`title`, new.`extracted_text`);
END;--> statement-breakpoint
CREATE TRIGGER `knowledge_documents_fts_delete` AFTER DELETE ON `knowledge_documents` BEGIN
	DELETE FROM `knowledge_documents_fts` WHERE `document_id` = old.`id`;
END;
