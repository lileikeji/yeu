CREATE TABLE `place_coordinate_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`longitude` real NOT NULL,
	`latitude` real NOT NULL,
	`coordinate_system` text NOT NULL,
	`accuracy_meters` real NOT NULL,
	`sample_count` integer NOT NULL,
	`samples_json` text NOT NULL,
	`capture_method` text NOT NULL,
	`point_role` text NOT NULL,
	`captured_at` integer NOT NULL,
	`evidence_note` text NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "coordinate_observations_crs_check" CHECK("place_coordinate_observations"."coordinate_system" in ('WGS84', 'GCJ-02', 'BD-09')),
	CONSTRAINT "coordinate_observations_method_check" CHECK("place_coordinate_observations"."capture_method" in ('browser-geolocation', 'authorized-import', 'map-review')),
	CONSTRAINT "coordinate_observations_role_check" CHECK("place_coordinate_observations"."point_role" in ('site-point', 'main-entrance')),
	CONSTRAINT "coordinate_observations_status_check" CHECK("place_coordinate_observations"."review_status" in ('pending', 'approved', 'rejected', 'superseded')),
	CONSTRAINT "coordinate_observations_longitude_check" CHECK("place_coordinate_observations"."longitude" between -180 and 180),
	CONSTRAINT "coordinate_observations_latitude_check" CHECK("place_coordinate_observations"."latitude" between -90 and 90),
	CONSTRAINT "coordinate_observations_accuracy_check" CHECK("place_coordinate_observations"."accuracy_meters" between 0 and 1000),
	CONSTRAINT "coordinate_observations_sample_count_check" CHECK("place_coordinate_observations"."sample_count" between 1 and 10),
	CONSTRAINT "coordinate_observations_review_check" CHECK(("place_coordinate_observations"."review_status" = 'pending' and "place_coordinate_observations"."reviewed_at" is null) or ("place_coordinate_observations"."review_status" != 'pending' and "place_coordinate_observations"."reviewed_at" is not null))
);
--> statement-breakpoint
CREATE INDEX `coordinate_observations_place_status_idx` ON `place_coordinate_observations` (`place_id`,`review_status`);--> statement-breakpoint
CREATE INDEX `coordinate_observations_status_created_idx` ON `place_coordinate_observations` (`review_status`,`created_at`);