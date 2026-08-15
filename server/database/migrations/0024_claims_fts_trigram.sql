DROP TRIGGER IF EXISTS `knowledge_claims_fts_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `knowledge_claims_fts_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `knowledge_claims_fts_insert`;
--> statement-breakpoint
DROP TABLE IF EXISTS `knowledge_claims_fts`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `knowledge_claims_fts` USING fts5(
	`claim_id` UNINDEXED,
	`title`,
	`statement`,
	`search_text`,
	tokenize = 'trigram'
);
--> statement-breakpoint
INSERT INTO `knowledge_claims_fts` (`claim_id`, `title`, `statement`, `search_text`)
SELECT `id`, `title`, `statement`, `search_text` FROM `knowledge_claims`;
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
