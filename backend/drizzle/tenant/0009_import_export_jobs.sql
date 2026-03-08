CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`import_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`file_name` text NOT NULL,
	`file_url` text NOT NULL,
	`file_size_bytes` integer DEFAULT 0 NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`processed_rows` integer DEFAULT 0 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`duplicate_strategy` text DEFAULT 'skip' NOT NULL,
	`column_mapping` text,
	`created_by` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`import_job_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`row_data` text NOT NULL,
	`errors` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `import_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`import_type` text NOT NULL,
	`display_name` text NOT NULL,
	`required_fields` text NOT NULL,
	`optional_fields` text NOT NULL,
	`sample_file_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`export_type` text DEFAULT 'full' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`file_url` text,
	`file_size_bytes` integer DEFAULT 0,
	`record_counts` text,
	`created_by` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_templates_import_type_unique` ON `import_templates` (`import_type`);
CREATE INDEX `import_jobs_created_by_idx` ON `import_jobs` (`created_by`);
CREATE INDEX `import_jobs_status_idx` ON `import_jobs` (`status`);
CREATE INDEX `import_errors_job_id_idx` ON `import_errors` (`import_job_id`);
CREATE INDEX `export_jobs_created_by_idx` ON `export_jobs` (`created_by`);
