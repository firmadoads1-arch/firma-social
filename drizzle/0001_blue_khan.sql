CREATE TABLE `runner_status` (
	`owner` text PRIMARY KEY NOT NULL,
	`checked_at` text NOT NULL,
	`processed` integer NOT NULL,
	`drafted` integer NOT NULL
);
