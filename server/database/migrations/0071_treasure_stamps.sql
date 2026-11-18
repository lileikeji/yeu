CREATE TABLE `treasure_stamps` (
  `user_id` text NOT NULL,
  `point_id` text NOT NULL,
  `collected_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `point_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
