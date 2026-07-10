CREATE TABLE `sourcing_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vacancy_id` integer NOT NULL,
	`sourcing_query_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`mode` text DEFAULT 'mock' NOT NULL,
	`desired_results` integer NOT NULL,
	`threshold` integer NOT NULL,
	`profile_limit` integer NOT NULL,
	`page_limit` integer NOT NULL,
	`batch_size` integer NOT NULL,
	`cache_age_days` integer NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`found_count` integer DEFAULT 0 NOT NULL,
	`saved_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`vacancy_id`) REFERENCES `vacancies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sourcing_query_id`) REFERENCES `sourcing_queries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sourcing_run_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`rank` integer NOT NULL,
	`profile_url` text NOT NULL,
	`full_name` text NOT NULL,
	`headline` text NOT NULL,
	`location` text NOT NULL,
	`score` integer NOT NULL,
	`matched_terms_json` text DEFAULT '[]' NOT NULL,
	`summary` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `sourcing_runs`(`id`) ON UPDATE no action ON DELETE no action
);
