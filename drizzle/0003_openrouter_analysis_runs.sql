CREATE TABLE `vacancy_analysis_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vacancy_id` integer NOT NULL,
	`vacancy_version_id` integer NOT NULL,
	`analysis_id` integer,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`model` text,
	`cost_usd` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`vacancy_id`) REFERENCES `vacancies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vacancy_version_id`) REFERENCES `vacancy_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`analysis_id`) REFERENCES `vacancy_analyses`(`id`) ON UPDATE no action ON DELETE no action
);