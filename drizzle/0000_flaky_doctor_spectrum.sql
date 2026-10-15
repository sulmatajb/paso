CREATE TABLE `learner_progress` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`snapshot` text NOT NULL,
	`updated_at` text NOT NULL
);
