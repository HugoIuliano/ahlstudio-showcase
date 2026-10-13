CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'machine' NOT NULL,
	`amount_cents` integer NOT NULL,
	`purchase_date` integer NOT NULL,
	`useful_life_months` integer DEFAULT 36 NOT NULL,
	`salvage_cents` integer DEFAULT 0 NOT NULL,
	`printer_id` text,
	`note` text,
	`disposed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `manual_revenues` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`line` text DEFAULT 'other' NOT NULL,
	`amount_cents` integer NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`date` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_supplies` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`supply_id` text NOT NULL,
	`qty_per_unit` real DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supply_id`) REFERENCES `supplies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `product_supplies_product_idx` ON `product_supplies` (`product_id`);--> statement-breakpoint
CREATE TABLE `supplies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`category` text DEFAULT 'other' NOT NULL,
	`unit` text DEFAULT 'un' NOT NULL,
	`qty` real DEFAULT 0 NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`min_qty` real DEFAULT 0 NOT NULL,
	`location` text,
	`supplier` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supply_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`supply_id` text NOT NULL,
	`delta` real NOT NULL,
	`reason` text NOT NULL,
	`unit_cost_cents` integer,
	`ref_type` text,
	`ref_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`supply_id`) REFERENCES `supplies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supply_movements_supply_idx` ON `supply_movements` (`supply_id`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `kind` text DEFAULT 'opex' NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `recurring` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `end_date` integer;--> statement-breakpoint
ALTER TABLE `expenses` ADD `supplier` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `note` text;--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE INDEX `expenses_kind_idx` ON `expenses` (`kind`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `unit_cost_cents` integer;