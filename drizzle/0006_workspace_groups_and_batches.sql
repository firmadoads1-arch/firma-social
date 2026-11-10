CREATE TABLE `geo_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`encrypted` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publish_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`account_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`count` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `batch_owner` ON `publish_batches` (`owner`,`account_id`);--> statement-breakpoint
CREATE TABLE `workspace_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_name_owner` ON `workspace_groups` (`owner`,`name_key`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `cover_media_id` text;--> statement-breakpoint
ALTER TABLE `media` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `batch_id` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `batch_position` integer;--> statement-breakpoint
CREATE INDEX `posts_batch_order` ON `posts` (`owner`,`batch_id`,`batch_position`);--> statement-breakpoint
ALTER TABLE `reference_models` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `reference_profiles` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `rules` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `templates` ADD `group_id` text;--> statement-breakpoint
CREATE INDEX `delivery_account_progress` ON `deliveries` (`owner`,`account_id`,`status`,`updated_at`);