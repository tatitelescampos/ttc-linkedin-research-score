ALTER TABLE `sourcing_runs` ADD `provider_status` text;
--> statement-breakpoint
ALTER TABLE `sourcing_runs` ADD `returned_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sourcing_runs` ADD `raw_response_json` text;
--> statement-breakpoint
ALTER TABLE `sourcing_runs` ADD `normalized_response_json` text;