-- 纠错回执：feedback 加回执号与「用户认为正确的说法」，并把 target_type 的可选值扩到 claim。
--
-- 为什么扩现有 feedback 表而不是新表：反馈与纠错共用一个审核队列，后台列表、状态流转
-- （new/reviewing -> resolved/rejected）和限流都已经在 feedback 上，新表等于把同一件事
-- 拆成两套写入。回执状态由 feedback.status 派生，不需要额外状态机。
--
-- SQLite 改不了已有 CHECK，所以按 drizzle 的表重建流程处理；旧行原样拷贝，
-- 新列 expected / receipt_code 为 null（历史反馈没有回执号）。
--
-- yeu:allow-table-rebuild feedback
-- ^ 发布闸门（scripts/release-tools.mjs 的 migrateDatabase）默认拒绝含
-- DROP TABLE / RENAME TO 的迁移，这一行是人工确认过重建 SQL、备份与回滚后的放行标记。
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`reason_type` text NOT NULL,
	`message` text NOT NULL,
	`expected` text,
	`evidence_url` text,
	`page_url` text,
	`contact` text,
	`receipt_code` text,
	`status` text DEFAULT 'new' NOT NULL,
	`resolution_note` text,
	`submitter_ip_hash` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resolved_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "feedback_status_check" CHECK("status" in ('new', 'reviewing', 'resolved', 'rejected', 'spam')),
	CONSTRAINT "feedback_target_type_check" CHECK("target_type" in ('general', 'place', 'content', 'procedure', 'claim')),
	CONSTRAINT "feedback_target_id_check" CHECK(("target_type" = 'general' and "target_id" is null) or ("target_type" != 'general' and "target_id" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_feedback`(
	"id", "target_type", "target_id", "reason_type", "message", "evidence_url",
	"page_url", "contact", "status", "resolution_note", "submitter_ip_hash",
	"resolved_by", "resolved_at", "created_at", "updated_at"
) SELECT
	"id", "target_type", "target_id", "reason_type", "message", "evidence_url",
	"page_url", "contact", "status", "resolution_note", "submitter_ip_hash",
	"resolved_by", "resolved_at", "created_at", "updated_at"
FROM `feedback`;--> statement-breakpoint
DROP TABLE `feedback`;--> statement-breakpoint
ALTER TABLE `__new_feedback` RENAME TO `feedback`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `feedback_status_created_idx` ON `feedback` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_target_idx` ON `feedback` (`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_receipt_code_unique` ON `feedback` (`receipt_code`);
