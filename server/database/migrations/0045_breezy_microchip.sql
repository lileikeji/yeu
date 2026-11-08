CREATE TABLE `email_verifications` (
	`email` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`dorm_building` text,
	`place_id` text,
	`is_muted_all` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "chat_rooms_kind_check" CHECK("__new_chat_rooms"."kind" in ('public', 'dorm', 'place'))
);
--> statement-breakpoint
INSERT INTO `__new_chat_rooms`("id", "kind", "slug", "title", "dorm_building", "place_id", "is_muted_all", "is_active", "created_at", "updated_at") SELECT "id", "kind", "slug", "title", "dorm_building", NULL, "is_muted_all", "is_active", "created_at", "updated_at" FROM `chat_rooms`;--> statement-breakpoint
DROP TABLE `chat_rooms`;--> statement-breakpoint
ALTER TABLE `__new_chat_rooms` RENAME TO `chat_rooms`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_rooms_slug_unique` ON `chat_rooms` (`slug`);--> statement-breakpoint
CREATE INDEX `chat_rooms_kind_idx` ON `chat_rooms` (`kind`);--> statement-breakpoint
CREATE INDEX `chat_rooms_dorm_idx` ON `chat_rooms` (`dorm_building`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_rooms_place_unique` ON `chat_rooms` (`place_id`) WHERE "chat_rooms"."kind" = 'place';--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);