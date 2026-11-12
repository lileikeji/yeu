-- 后台知识库列表按 updated_at 倒序分页。knowledge_claims 有 12 万行，缺这个索引时
-- 每次进后台都是「全表扫 + 临时 B 树排序」，实测 0.19s（热）到 9.3s（冷），
-- 而 better-sqlite3 是同步执行，扫描期间整个 Node 事件循环停摆。
-- 用 IF NOT EXISTS：该索引可能已在生产库手工建过，迁移重放不能因此失败。
CREATE INDEX IF NOT EXISTS `knowledge_claims_updated_idx` ON `knowledge_claims` (`updated_at`);
