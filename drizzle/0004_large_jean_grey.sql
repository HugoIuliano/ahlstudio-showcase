CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text,
	`type` text NOT NULL,
	`version` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `consents_email_idx` ON `consents` (`email`);--> statement-breakpoint
CREATE INDEX `consents_type_idx` ON `consents` (`type`);--> statement-breakpoint
ALTER TABLE `orders` ADD `access_token` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `access_token` text;