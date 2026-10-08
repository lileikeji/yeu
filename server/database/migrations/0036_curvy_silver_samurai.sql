ALTER TABLE `recruit_forms` ADD `payment_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recruit_forms` ADD `payment_wechat_image` text;--> statement-breakpoint
ALTER TABLE `recruit_forms` ADD `payment_alipay_image` text;--> statement-breakpoint
ALTER TABLE `recruit_forms` ADD `payment_note` text;--> statement-breakpoint
ALTER TABLE `recruit_submissions` ADD `payment_confirmed` integer;