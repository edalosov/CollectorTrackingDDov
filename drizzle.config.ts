import { defineConfig } from "drizzle-kit";

// DATABASE_URL is only required for commands that connect to a real database
// (migrate, push, studio) — "generate" just diffs the schema file and needs
// no live connection, so we don't throw eagerly here.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
