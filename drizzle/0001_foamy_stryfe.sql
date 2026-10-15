CREATE TABLE `model_usage` (
	`user_id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL
);
