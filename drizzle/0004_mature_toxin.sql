CREATE TABLE "ownership_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"previous_balance" integer NOT NULL,
	"new_balance" integer NOT NULL,
	"detected_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ownership_changes" ADD CONSTRAINT "ownership_changes_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_changes" ADD CONSTRAINT "ownership_changes_wallet_address_wallets_address_fk" FOREIGN KEY ("wallet_address") REFERENCES "public"."wallets"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ownership_changes_collection_idx" ON "ownership_changes" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "ownership_changes_detected_idx" ON "ownership_changes" USING btree ("detected_at");