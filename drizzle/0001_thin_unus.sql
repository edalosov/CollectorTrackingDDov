CREATE TABLE "tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"name" text,
	"image_url" text
);
--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_collection_token_idx" ON "tokens" USING btree ("collection_id","token_id");