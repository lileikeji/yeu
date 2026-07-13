CREATE TABLE `__place_sources_backup` (
	`place_id` text NOT NULL,
	`source_id` text NOT NULL,
	`is_primary` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__place_sources_backup` (`place_id`, `source_id`, `is_primary`, `created_at`)
SELECT `place_id`, `source_id`, `is_primary`, `created_at` FROM `place_sources`;--> statement-breakpoint
CREATE TABLE `__new_places` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`scope` text NOT NULL,
	`type` text NOT NULL,
	`category` text,
	`address` text,
	`campus_area` text,
	`floor` text,
	`room` text,
	`longitude` real,
	`latitude` real,
	`coordinate_system` text,
	`coordinate_verification` text DEFAULT 'missing' NOT NULL,
	`coordinate_verified_at` integer,
	`source_raw_ref` text,
	`opening_hours` text,
	`phone` text,
	`website` text,
	`external_map_url` text,
	`is_official` integer DEFAULT false NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`last_verified_at` integer,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "places_scope_check" CHECK("__new_places"."scope" in ('campus', 'nearby')),
	CONSTRAINT "places_status_check" CHECK("__new_places"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "places_crs_check" CHECK("__new_places"."coordinate_system" in ('WGS84', 'GCJ-02', 'BD-09')),
	CONSTRAINT "places_coordinate_verification_check" CHECK("__new_places"."coordinate_verification" in ('missing', 'unverified', 'verified', 'rejected')),
	CONSTRAINT "places_longitude_check" CHECK("__new_places"."longitude" is null or "__new_places"."longitude" between -180 and 180),
	CONSTRAINT "places_latitude_check" CHECK("__new_places"."latitude" is null or "__new_places"."latitude" between -90 and 90),
	CONSTRAINT "places_coordinate_group_check" CHECK(("__new_places"."longitude" is null and "__new_places"."latitude" is null and "__new_places"."coordinate_system" is null) or ("__new_places"."longitude" is not null and "__new_places"."latitude" is not null and "__new_places"."coordinate_system" is not null)),
	CONSTRAINT "places_verified_coordinate_check" CHECK("__new_places"."coordinate_verification" != 'verified' or ("__new_places"."longitude" is not null and "__new_places"."latitude" is not null and "__new_places"."coordinate_system" is not null)),
	CONSTRAINT "places_missing_coordinate_check" CHECK("__new_places"."coordinate_verification" != 'missing' or ("__new_places"."longitude" is null and "__new_places"."latitude" is null and "__new_places"."coordinate_system" is null))
);
--> statement-breakpoint
INSERT INTO `__new_places`("id", "slug", "name", "summary", "body", "scope", "type", "category", "address", "campus_area", "floor", "room", "longitude", "latitude", "coordinate_system", "coordinate_verification", "coordinate_verified_at", "source_raw_ref", "opening_hours", "phone", "website", "external_map_url", "is_official", "is_featured", "status", "last_verified_at", "published_at", "created_at", "updated_at") SELECT "id", "slug", "name", "summary", "body", "scope", "type", "category", "address", "campus_area", "floor", "room", "longitude", "latitude", "coordinate_system", CASE WHEN "longitude" IS NOT NULL AND "latitude" IS NOT NULL AND "coordinate_system" IS NOT NULL THEN 'unverified' ELSE 'missing' END, NULL, NULL, "opening_hours", "phone", "website", "external_map_url", "is_official", "is_featured", "status", "last_verified_at", "published_at", "created_at", "updated_at" FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
ALTER TABLE `__new_places` RENAME TO `places`;--> statement-breakpoint
CREATE UNIQUE INDEX `places_slug_unique` ON `places` (`slug`);--> statement-breakpoint
CREATE INDEX `places_public_list_idx` ON `places` (`status`,`scope`,`type`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`category`);--> statement-breakpoint
INSERT INTO `place_sources` (`place_id`, `source_id`, `is_primary`, `created_at`)
SELECT `place_id`, `source_id`, `is_primary`, `created_at` FROM `__place_sources_backup`;--> statement-breakpoint
DROP TABLE `__place_sources_backup`;
