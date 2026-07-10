CREATE TABLE `candidate_decisions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `vacancy_id` integer NOT NULL,
  `profile_id` integer NOT NULL,
  `evaluation_id` integer,
  `decision` text DEFAULT 'undecided' NOT NULL,
  `note` text,
  `decided_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`vacancy_id`) REFERENCES `vacancies`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`profile_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`evaluation_id`) REFERENCES `profile_evaluations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_decisions_vacancy_profile_unique` ON `candidate_decisions` (`vacancy_id`,`profile_id`);