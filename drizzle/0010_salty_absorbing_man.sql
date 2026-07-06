CREATE TABLE "custodial_token_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"collection_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custodial_token_assignments" ADD CONSTRAINT "custodial_token_assignments_wallet_address_wallets_address_fk" FOREIGN KEY ("wallet_address") REFERENCES "public"."wallets"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodial_token_assignments" ADD CONSTRAINT "custodial_token_assignments_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custodial_token_assignments_wallet_collection_token_idx" ON "custodial_token_assignments" USING btree ("wallet_address","collection_id","token_id");--> statement-breakpoint
CREATE INDEX "custodial_token_assignments_wallet_collection_name_idx" ON "custodial_token_assignments" USING btree ("wallet_address","collection_id","name");