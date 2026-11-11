ALTER TABLE `competition_rounds` ADD `active_day` integer;
--> statement-breakpoint
ALTER TABLE `competition_round_entries` ADD `contest_day` integer;
--> statement-breakpoint
ALTER TABLE `competition_judges` ADD `day` integer;
