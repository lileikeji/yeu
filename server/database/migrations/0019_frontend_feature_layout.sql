ALTER TABLE `frontend_feature_settings` ADD `placement` text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE `frontend_feature_settings` ADD `sort_order` integer DEFAULT 100 NOT NULL;
