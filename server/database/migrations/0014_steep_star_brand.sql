ALTER TABLE `users` ADD `chat_dorm_building` text;--> statement-breakpoint
UPDATE `users`
SET `chat_dorm_building` = `dorm_building`
WHERE `dorm_building` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `users_chat_dorm_idx` ON `users` (`chat_dorm_building`);
