ALTER TABLE `order_items` ADD `to_produce_qty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `labor_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `due_at` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `target_stock_qty` integer DEFAULT 0 NOT NULL;