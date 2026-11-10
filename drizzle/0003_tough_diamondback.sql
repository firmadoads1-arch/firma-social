CREATE TABLE `connection_links` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`platform` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_started_at` integer DEFAULT 0 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_link_owner_platform` ON `connection_links` (`owner`,`platform`);