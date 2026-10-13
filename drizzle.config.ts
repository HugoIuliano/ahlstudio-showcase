import { defineConfig } from "drizzle-kit";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

// Sem TURSO_DATABASE_URL usamos SQLite local (dev). Com Turso, dialect "turso".
export default defineConfig(
  url.startsWith("file:")
    ? { dialect: "sqlite", schema: "./src/db/schema.ts", out: "./drizzle", dbCredentials: { url } }
    : { dialect: "turso", schema: "./src/db/schema.ts", out: "./drizzle", dbCredentials: { url, authToken } },
);
