CREATE TABLE `vacancy_analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vacancy_id` integer NOT NULL,
	`vacancy_version_id` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`seniority` text,
	`titles_json` text DEFAULT '[]' NOT NULL,
	`locations_json` text DEFAULT '[]' NOT NULL,
	`ambiguities_json` text DEFAULT '[]' NOT NULL,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`vacancy_id`) REFERENCES `vacancies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vacancy_version_id`) REFERENCES `vacancy_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vacancy_analyses_vacancy_id_unique` ON `vacancy_analyses` (`vacancy_id`);
--> statement-breakpoint
CREATE TABLE `vacancy_analysis_requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`analysis_id` integer NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`normalized_label` text NOT NULL,
	`provenance` text NOT NULL,
	`weight` integer DEFAULT 50 NOT NULL,
	`is_mandatory` integer DEFAULT false NOT NULL,
	`is_eliminatory` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `vacancy_analyses`(`id`) ON UPDATE no action ON DELETE no action
);
