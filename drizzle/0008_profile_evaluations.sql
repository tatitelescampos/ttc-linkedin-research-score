CREATE TABLE `profile_evaluations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `vacancy_id` integer NOT NULL,
  `analysis_id` integer NOT NULL,
  `profile_id` integer NOT NULL,
  `suitability_score` integer NOT NULL,
  `confidence` integer NOT NULL,
  `category` text NOT NULL,
  `is_eliminated` integer DEFAULT false NOT NULL,
  `elimination_reason` text,
  `missing_information_json` text DEFAULT '[]' NOT NULL,
  `explanation` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`vacancy_id`) REFERENCES `vacancies`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`analysis_id`) REFERENCES `vacancy_analyses`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`profile_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_evaluations_vacancy_profile_unique` ON `profile_evaluations` (`vacancy_id`,`profile_id`);
--> statement-breakpoint
CREATE TABLE `profile_requirement_evidence` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `evaluation_id` integer NOT NULL,
  `requirement_id` integer NOT NULL,
  `status` text NOT NULL,
  `score_contribution` integer DEFAULT 0 NOT NULL,
  `confidence` integer DEFAULT 0 NOT NULL,
  `evidence_text` text,
  `explanation` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`evaluation_id`) REFERENCES `profile_evaluations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`requirement_id`) REFERENCES `vacancy_analysis_requirements`(`id`) ON UPDATE no action ON DELETE no action
);