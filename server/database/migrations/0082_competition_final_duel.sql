ALTER TABLE `competition_rounds` ADD COLUMN `advance_mode` text NOT NULL DEFAULT 'rank' CHECK (`advance_mode` in ('rank', 'duel'));
--> statement-breakpoint
ALTER TABLE `competition_round_entries` ADD COLUMN `pair_no` integer;
--> statement-breakpoint
ALTER TABLE `competition_round_entries` ADD COLUMN `pair_slot` integer CHECK (`pair_slot` is null or `pair_slot` in (1, 2));
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_round_entries_pair_unique` ON `competition_round_entries` (`round_id`, `pair_no`, `pair_slot`);
