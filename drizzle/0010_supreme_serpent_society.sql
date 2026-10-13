CREATE TABLE `shipping_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cep_start` integer NOT NULL,
	`cep_end` integer NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`free_from_cents` integer DEFAULT 0 NOT NULL,
	`min_days` integer DEFAULT 1 NOT NULL,
	`max_days` integer DEFAULT 2 NOT NULL,
	`note` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`user_id` text,
	`label` text DEFAULT 'Principal',
	`recipient` text,
	`phone` text,
	`street` text NOT NULL,
	`number` text NOT NULL,
	`complement` text,
	`district` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`zip` text NOT NULL,
	`reference` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_addresses`("id", "customer_id", "user_id", "label", "recipient", "phone", "street", "number", "complement", "district", "city", "state", "zip", "reference", "is_default", "created_at") SELECT "id", "customer_id", NULL, "label", "recipient", NULL, "street", "number", "complement", "district", "city", "state", "zip", NULL, "is_default", (strftime('%s','now') * 1000) FROM `addresses`;--> statement-breakpoint
DROP TABLE `addresses`;--> statement-breakpoint
ALTER TABLE `__new_addresses` RENAME TO `addresses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `addresses_user_idx` ON `addresses` (`user_id`);--> statement-breakpoint
CREATE INDEX `addresses_customer_idx` ON `addresses` (`customer_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_service` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_carrier` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_days_min` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_days_max` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_zip` text;--> statement-breakpoint
ALTER TABLE `products` ADD `weight_grams` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `width_cm` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `height_cm` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `length_cm` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `document` text;