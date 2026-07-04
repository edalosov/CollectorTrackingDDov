CREATE TABLE "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" integer NOT NULL,
	"block_timestamp" timestamp,
	"is_sale" boolean DEFAULT false NOT NULL,
	"marketplace" text,
	"price_wei" text,
	"price_symbol" text
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_from_address_wallets_address_fk" FOREIGN KEY ("from_address") REFERENCES "public"."wallets"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_to_address_wallets_address_fk" FOREIGN KEY ("to_address") REFERENCES "public"."wallets"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_tx_log_token_idx" ON "activity" USING btree ("tx_hash","log_index","token_id");--> statement-breakpoint
CREATE INDEX "activity_collection_idx" ON "activity" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "activity_block_idx" ON "activity" USING btree ("block_number");