CREATE TABLE `prisma_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`original_views` integer NOT NULL,
	`variant_views` integer NOT NULL,
	`notes` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prisma_experiments_project` ON `prisma_experiments` (`owner`,`project_id`,`created`);--> statement-breakpoint
CREATE TABLE `prisma_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`tool` text NOT NULL,
	`kind` text NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prisma_files_project` ON `prisma_files` (`owner`,`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prisma_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`group_id` text,
	`name` text NOT NULL,
	`folder` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prisma_project_name` ON `prisma_projects` (`owner`,`name`);--> statement-breakpoint
CREATE TABLE `prisma_templates` (
	`id` text NOT NULL,
	`owner` text NOT NULL,
	`handle` text NOT NULL,
	`avatar_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`crop` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prisma_template_handle` ON `prisma_templates` (`owner`,`handle`);