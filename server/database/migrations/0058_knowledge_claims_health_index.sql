-- 后台概览的 knowledge health 聚合原来用 NOT EXISTS 相关子查询数「评审/已发布但
-- 没有证据」的条数，跑在 12.3 万行的 knowledge_claims 上：冷读 5.9s、热读 1.4s，
-- better-sqlite3 同步执行期间整个事件循环停摆（2026-11-12 实测一次进后台 15s）。
-- 改为维护 source_count 计数器 + 覆盖索引，聚合成单次索引扫描（约 50ms）。
ALTER TABLE `knowledge_claims` ADD COLUMN `source_count` integer NOT NULL DEFAULT 0;--> statement-breakpoint
-- 回填：现有 12.3 万条按证据表实际条数写一遍。
UPDATE `knowledge_claims`
SET `source_count` = (
  SELECT count(*) FROM `knowledge_claim_sources` kcs WHERE kcs.`claim_id` = `knowledge_claims`.`id`
);--> statement-breakpoint
-- 覆盖索引与分类索引：health 聚合与「按分类统计」都改成纯索引扫描。
-- 生产库可能已手工建过同名索引，先删后建保证列定义一致。
DROP INDEX IF EXISTS `knowledge_claims_health_idx`;--> statement-breakpoint
CREATE INDEX `knowledge_claims_health_idx`
  ON `knowledge_claims` (`review_status`, `confidence_label`, `valid_until`, `source_count`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `knowledge_claims_category_idx` ON `knowledge_claims` (`category`);
