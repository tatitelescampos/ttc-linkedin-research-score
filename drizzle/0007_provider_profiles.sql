CREATE TABLE `provider_profiles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider` text NOT NULL,
  `provider_id` text,
  `linkedin_url` text,
  `public_identifier` text,
  `full_name` text NOT NULL,
  `headline` text,
  `location` text,
  `cache_status` text DEFAULT 'fresh' NOT NULL,
  `last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_profiles_provider_id_unique` ON `provider_profiles` (`provider`,`provider_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_profiles_linkedin_url_unique` ON `provider_profiles` (`linkedin_url`);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_profiles_public_identifier_unique` ON `provider_profiles` (`public_identifier`);
--> statement-breakpoint
CREATE TABLE `provider_profile_versions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `profile_id` integer NOT NULL,
  `source_run_id` integer,
  `raw_json` text NOT NULL,
  `normalized_json` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`profile_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`source_run_id`) REFERENCES `sourcing_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `provider_profile_identity_reviews` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `source_run_id` integer,
  `reason` text NOT NULL,
  `candidate_json` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`source_run_id`) REFERENCES `sourcing_runs`(`id`) ON UPDATE no action ON DELETE no action
);
