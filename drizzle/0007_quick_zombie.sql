CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`actor_email` text,
	`actor_role` text,
	`entity_type` text,
	`entity_id` text,
	`summary` text NOT NULL,
	`meta` text,
	`ip` text,
	`user_agent` text,
	`path` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
ALTER TABLE `users` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` integer;