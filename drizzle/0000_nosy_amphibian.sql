CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`platform` text NOT NULL,
	`provider_id` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`tokens` text NOT NULL,
	`expires_at` integer,
	`scopes` text NOT NULL,
	`state` text DEFAULT 'connected' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_identity` ON `accounts` (`owner`,`platform`,`provider_id`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`owner` text NOT NULL,
	`account_id` text NOT NULL,
	`platform` text NOT NULL,
	`status` text NOT NULL,
	`remote_id` text,
	`context` text DEFAULT '{}' NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_run` integer NOT NULL,
	`lease` text,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_unique` ON `deliveries` (`post_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `delivery_due` ON `deliveries` (`status`,`next_run`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`post_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_owner` ON `events` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`width` integer,
	`height` integer,
	`duration` real,
	`folder` text DEFAULT 'Geral' NOT NULL,
	`public_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_owner` ON `media` (`owner`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`platform` text NOT NULL,
	`verifier` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`caption` text NOT NULL,
	`captions` text DEFAULT '{}' NOT NULL,
	`platforms` text NOT NULL,
	`account_ids` text NOT NULL,
	`media_ids` text NOT NULL,
	`format` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` integer,
	`options` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`write_token` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_owner` ON `posts` (`owner`);--> statement-breakpoint
CREATE INDEX `posts_due` ON `posts` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `provider_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`platform` text NOT NULL,
	`encrypted` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_owner` ON `provider_configs` (`owner`,`platform`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`time` text NOT NULL,
	`weekdays` text NOT NULL,
	`account_ids` text NOT NULL,
	`media_ids` text NOT NULL,
	`caption` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`last_date` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`caption` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`owner` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'America/Sao_Paulo' NOT NULL,
	`created_at` integer NOT NULL
);
