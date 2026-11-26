-- yeu:allow-table-rebuild 关闭口令后 fixed_passcode 已无读写方，删列只是收尾；allow_withdraw 为新增列，无数据搬迁。
ALTER TABLE `competition_popularity_settings` DROP COLUMN `fixed_passcode`;
--> statement-breakpoint
ALTER TABLE `competition_popularity_settings` ADD COLUMN `allow_withdraw` integer DEFAULT 1 NOT NULL;
