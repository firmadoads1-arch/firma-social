CREATE TABLE `reference_models` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`reference_id` text,
	`platform` text NOT NULL,
	`title` text NOT NULL,
	`niche` text DEFAULT 'Geral' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'video' NOT NULL,
	`hook` text DEFAULT '' NOT NULL,
	`outline` text DEFAULT '' NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reference_model_owner` ON `reference_models` (`owner`,`updated_at`);--> statement-breakpoint
CREATE INDEX `reference_model_profile` ON `reference_models` (`reference_id`);--> statement-breakpoint
CREATE TABLE `reference_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`platform` text NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`kind` text DEFAULT 'page' NOT NULL,
	`niche` text DEFAULT 'Geral' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_profile_identity` ON `reference_profiles` (`owner`,`platform`,`handle`);--> statement-breakpoint
CREATE INDEX `reference_profile_owner` ON `reference_profiles` (`owner`,`updated_at`);