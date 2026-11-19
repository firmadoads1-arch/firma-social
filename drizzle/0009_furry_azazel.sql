ALTER TABLE `posts` ADD `recurrence_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `post_recurrence_day` ON `posts` (`owner`,`recurrence_key`);--> statement-breakpoint
ALTER TABLE `rules` ADD `mode` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `rules` ADD `starts_on` text;--> statement-breakpoint
ALTER TABLE `rules` ADD `approved_at` integer;