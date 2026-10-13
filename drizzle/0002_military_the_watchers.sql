CREATE TABLE `product_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`material_id` text NOT NULL,
	`grams_per_unit` integer DEFAULT 0 NOT NULL,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `product_materials_product_idx` ON `product_materials` (`product_id`);--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `variant_id` text REFERENCES product_variants(id);--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `produced_qty` integer;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `failed_qty` integer;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `waste_grams` integer;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `adds_to_stock` integer DEFAULT false NOT NULL;