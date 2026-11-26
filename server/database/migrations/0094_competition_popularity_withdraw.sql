-- fixed_passcode 停用但保留列：SQLite 删列会触发发布闸门的“业务列不兼容”校验，且该列无读写方，留着不影响契约。
ALTER TABLE `competition_popularity_settings` ADD COLUMN `allow_withdraw` integer DEFAULT 1 NOT NULL;
