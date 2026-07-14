ALTER TABLE `place_coordinate_observations` ADD `client_observation_id` text;--> statement-breakpoint
ALTER TABLE `place_coordinate_observations` ADD `superseded_by_observation_id` text REFERENCES place_coordinate_observations(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `coordinate_observations_client_id_unique` ON `place_coordinate_observations` (`client_observation_id`);
