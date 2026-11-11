-- 知识修订号持久化。原实现是 knowledge-revision.ts 里的进程内 let 计数器：重启归零、
-- 多进程各算各的，而它同时是 assistant_answer_cache.cache_key 的第三段，于是重启后
-- 上一轮落库的答案还会命中，内容更新也发旧答案。
--
-- 单行表，id 固定 'assistant'：读不存在的行时由代码建零行，之后一律 upsert +1。
CREATE TABLE `assistant_knowledge_state` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
