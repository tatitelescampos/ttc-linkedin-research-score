CREATE TABLE `sourcing_queries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vacancy_id` integer NOT NULL,
	`analysis_id` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version_number` integer,
	`query_text` text NOT NULL,
	`provider_filters_json` text DEFAULT '{}' NOT NULL,
	`explanation` text NOT NULL,
	`assumptions_json` text DEFAULT '[]' NOT NULL,
	`limitations_json` text DEFAULT '[]' NOT NULL,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`vacancy_id`) REFERENCES `vacancies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`analysis_id`) REFERENCES `vacancy_analyses`(`id`) ON UPDATE no action ON DELETE no action
);