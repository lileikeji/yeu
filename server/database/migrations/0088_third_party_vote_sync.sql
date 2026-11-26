CREATE TABLE `third_party_vote_records` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'jinshuju' NOT NULL,
	`form_token` text NOT NULL,
	`record_id` text NOT NULL,
	`option_id` text NOT NULL,
	`voter_ref` text,
	`ip_hash` text,
	`ip_cidr` text,
	`ua_summary` text,
	`voted_at` integer NOT NULL,
	`fill_seconds` integer,
	`score` integer DEFAULT 0 NOT NULL,
	`flags_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'valid' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	CONSTRAINT "third_party_vote_records_status_check" CHECK("status" in ('valid', 'watch', 'void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `third_party_vote_records_provider_record_unique` ON `third_party_vote_records` (`provider`, `record_id`);
--> statement-breakpoint
CREATE INDEX `third_party_vote_records_form_status_idx` ON `third_party_vote_records` (`form_token`, `status`, `voted_at`);
--> statement-breakpoint
CREATE INDEX `third_party_vote_records_option_idx` ON `third_party_vote_records` (`form_token`, `option_id`, `status`);
--> statement-breakpoint
CREATE INDEX `third_party_vote_records_ip_idx` ON `third_party_vote_records` (`form_token`, `ip_cidr`, `voted_at`);
--> statement-breakpoint
CREATE TABLE `third_party_vote_sync_states` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'jinshuju' NOT NULL,
	`form_token` text NOT NULL,
	`cursor` text,
	`last_synced_at` integer,
	`last_entry_at` integer,
	`total_synced` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `third_party_vote_sync_states_provider_form_unique` ON `third_party_vote_sync_states` (`provider`, `form_token`);
