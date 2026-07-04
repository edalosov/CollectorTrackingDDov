CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"name" text,
	"symbol" text,
	"token_type" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"last_synced_at" timestamp,
	CONSTRAINT "collections_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"wallet_address" text NOT NULL,
	"token_id" text NOT NULL,
	"balance" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"address" text PRIMARY KEY NOT NULL,
	"nickname" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_wallet_address_wallets_address_fk" FOREIGN KEY ("wallet_address") REFERENCES "public"."wallets"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_collection_token_wallet_idx" ON "holdings" USING btree ("collection_id","token_id","wallet_address");--> statement-breakpoint
CREATE INDEX "holdings_collection_idx" ON "holdings" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "holdings_wallet_idx" ON "holdings" USING btree ("wallet_address");