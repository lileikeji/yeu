CREATE TABLE `procedure_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`procedure_id` text NOT NULL,
	`item_order` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`audience_json` text DEFAULT '[]' NOT NULL,
	`is_required` integer,
	`information_state` text DEFAULT 'awaiting-notice' NOT NULL,
	`place_id` text,
	`department_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`department_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "procedure_materials_order_check" CHECK("procedure_materials"."item_order" >= 1),
	CONSTRAINT "procedure_materials_audience_json_check" CHECK(json_valid("procedure_materials"."audience_json") and json_array_length("procedure_materials"."audience_json") >= 1),
	CONSTRAINT "procedure_materials_information_state_check" CHECK("procedure_materials"."information_state" in ('confirmed', 'partial', 'awaiting-notice'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procedure_materials_order_unique` ON `procedure_materials` (`procedure_id`,`item_order`);--> statement-breakpoint
CREATE INDEX `procedure_materials_place_idx` ON `procedure_materials` (`place_id`);--> statement-breakpoint
CREATE INDEX `procedure_materials_department_idx` ON `procedure_materials` (`department_id`);--> statement-breakpoint
CREATE TABLE `procedure_places` (
	`procedure_id` text NOT NULL,
	`place_id` text NOT NULL,
	`role` text DEFAULT 'related' NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`procedure_id`, `place_id`),
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "procedure_places_order_check" CHECK("procedure_places"."sort_order" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procedure_places_order_unique` ON `procedure_places` (`procedure_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `procedure_places_place_idx` ON `procedure_places` (`place_id`);--> statement-breakpoint
CREATE TABLE `procedure_sources` (
	`procedure_id` text NOT NULL,
	`source_id` text NOT NULL,
	`claim_scope` text DEFAULT '' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`procedure_id`, `source_id`),
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "procedure_sources_order_check" CHECK("procedure_sources"."sort_order" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procedure_sources_order_unique` ON `procedure_sources` (`procedure_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `procedure_sources_source_idx` ON `procedure_sources` (`source_id`);--> statement-breakpoint
CREATE TABLE `procedure_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`procedure_id` text NOT NULL,
	`step_order` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`audience_json` text DEFAULT '[]' NOT NULL,
	`information_state` text DEFAULT 'awaiting-notice' NOT NULL,
	`time_text` text,
	`place_id` text,
	`department_id` text,
	`action_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`department_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "procedure_steps_order_check" CHECK("procedure_steps"."step_order" >= 1),
	CONSTRAINT "procedure_steps_audience_json_check" CHECK(json_valid("procedure_steps"."audience_json") and json_array_length("procedure_steps"."audience_json") >= 1),
	CONSTRAINT "procedure_steps_information_state_check" CHECK("procedure_steps"."information_state" in ('confirmed', 'partial', 'awaiting-notice'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procedure_steps_order_unique` ON `procedure_steps` (`procedure_id`,`step_order`);--> statement-breakpoint
CREATE INDEX `procedure_steps_place_idx` ON `procedure_steps` (`place_id`);--> statement-breakpoint
CREATE INDEX `procedure_steps_department_idx` ON `procedure_steps` (`department_id`);--> statement-breakpoint
CREATE TABLE `procedures` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`category` text,
	`audience_json` text DEFAULT '[]' NOT NULL,
	`method` text NOT NULL,
	`information_state` text DEFAULT 'awaiting-notice' NOT NULL,
	`status_text` text NOT NULL,
	`processing_time` text,
	`deadline_text` text,
	`starts_at` integer,
	`ends_at` integer,
	`valid_from` integer,
	`valid_until` integer,
	`department_id` text,
	`guide_id` text,
	`seed_owner` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`last_verified_at` integer,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`guide_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "procedures_method_check" CHECK("procedures"."method" in ('online', 'offline', 'mixed')),
	CONSTRAINT "procedures_information_state_check" CHECK("procedures"."information_state" in ('confirmed', 'partial', 'awaiting-notice')),
	CONSTRAINT "procedures_status_check" CHECK("procedures"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "procedures_audience_json_check" CHECK(json_valid("procedures"."audience_json") and json_array_length("procedures"."audience_json") >= 1),
	CONSTRAINT "procedures_schedule_check" CHECK("procedures"."starts_at" is null or "procedures"."ends_at" is null or "procedures"."ends_at" >= "procedures"."starts_at"),
	CONSTRAINT "procedures_validity_check" CHECK("procedures"."valid_from" is null or "procedures"."valid_until" is null or "procedures"."valid_until" >= "procedures"."valid_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procedures_slug_unique` ON `procedures` (`slug`);--> statement-breakpoint
CREATE INDEX `procedures_public_list_idx` ON `procedures` (`status`,`category`,`starts_at`);--> statement-breakpoint
CREATE INDEX `procedures_department_idx` ON `procedures` (`department_id`);--> statement-breakpoint
CREATE INDEX `procedures_guide_idx` ON `procedures` (`guide_id`);