ALTER TABLE `orders` ADD `shipping_cost_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_zones` ADD `cost_cents` integer DEFAULT 0 NOT NULL;