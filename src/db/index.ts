import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Em dev sem Turso configurado cai para SQLite local (./local.db).
const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const globalForDb = globalThis as unknown as { __libsql?: ReturnType<typeof createClient> };

// Reaproveita o client entre hot-reloads do next dev.
const client = globalForDb.__libsql ?? createClient({ url, authToken });
if (process.env.NODE_ENV !== "production") globalForDb.__libsql = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
