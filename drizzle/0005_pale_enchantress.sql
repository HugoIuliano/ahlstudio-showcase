ALTER TABLE `products` ADD `kind` text DEFAULT 'stock' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `quote_brief` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `product_id` text REFERENCES products(id);