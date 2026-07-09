CREATE TABLE `research_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`linkedin_url` text NOT NULL,
	`title` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_items_linkedin_url_unique` ON `research_items` (`linkedin_url`);