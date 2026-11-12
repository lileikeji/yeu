-- 后台概览最后一个过百毫秒的查询是「无筛选访客总数」：select count(*) from visitors
-- 要扫 38,335 行的覆盖索引，热读 120ms、冷读 500–1,358ms，better-sqlite3 同步执行
-- 期间整个事件循环停摆。改成一张单行计数表，由触发器随增删维护，读取恒定约 0.01ms。
CREATE TABLE IF NOT EXISTS `visitor_stats` (
  `id` integer PRIMARY KEY CHECK (`id` = 1),
  `total` integer NOT NULL DEFAULT 0
);--> statement-breakpoint
INSERT OR REPLACE INTO `visitor_stats` (`id`, `total`) SELECT 1, count(*) FROM `visitors`;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `visitors_stats_insert`
AFTER INSERT ON `visitors`
BEGIN
  UPDATE `visitor_stats` SET `total` = `total` + 1 WHERE `id` = 1;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `visitors_stats_delete`
AFTER DELETE ON `visitors`
BEGIN
  UPDATE `visitor_stats` SET `total` = `total` - 1 WHERE `id` = 1;
END;--> statement-breakpoint
-- 后台资料列表按 updated_at 倒序取第一页，10,685 行原来是「全表扫 + 临时 B 树排序」。
CREATE INDEX IF NOT EXISTS `sources_updated_idx` ON `sources` (`updated_at`);
