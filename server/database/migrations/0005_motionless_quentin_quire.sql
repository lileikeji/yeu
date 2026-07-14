ALTER TABLE `places` ADD `coordinate_point_role` text;--> statement-breakpoint
UPDATE `places`
SET `coordinate_point_role` = (
	SELECT `point_role`
	FROM `place_coordinate_observations`
	WHERE `place_coordinate_observations`.`place_id` = `places`.`id`
		AND `place_coordinate_observations`.`review_status` = 'approved'
	ORDER BY `place_coordinate_observations`.`reviewed_at` DESC,
		`place_coordinate_observations`.`created_at` DESC
	LIMIT 1
)
WHERE EXISTS (
	SELECT 1
	FROM `place_coordinate_observations`
	WHERE `place_coordinate_observations`.`place_id` = `places`.`id`
		AND `place_coordinate_observations`.`review_status` = 'approved'
);--> statement-breakpoint
UPDATE `places`
SET `coordinate_verification` = 'unverified',
	`coordinate_verified_at` = NULL
WHERE `coordinate_verification` = 'verified';
