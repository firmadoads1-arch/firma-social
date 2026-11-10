CREATE TABLE `analytics_media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`product` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`permalink` text,
	`published_at` integer NOT NULL,
	`metrics` text DEFAULT '{}' NOT NULL,
	`measured_at` integer,
	`attempted_at` integer,
	`metric_status` text DEFAULT 'waiting' NOT NULL,
	`discovered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_media_identity` ON `analytics_media` (`owner`,`account_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `analytics_media_owner_date` ON `analytics_media` (`owner`,`published_at`);--> statement-breakpoint
CREATE TABLE `analytics_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`cycle_started_at` integer,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`next_sync_at` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer,
	`feed_cursor` text,
	`story_cursor` text,
	`feed_done` integer DEFAULT 0 NOT NULL,
	`story_done` integer DEFAULT 0 NOT NULL,
	`error` text,
	`partial` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_sync_owner_due` ON `analytics_sync` (`owner`,`next_sync_at`);