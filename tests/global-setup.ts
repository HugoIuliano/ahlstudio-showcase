/** Roda uma vez antes de todos os arquivos: recria o banco de teste e aplica as migrations reais. */
import fs from "node:fs";
import path from "node:path";

export default async function globalSetup() {
  const dbFile = path.resolve(__dirname, ".tmp/test.db");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  for (const f of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
  const url = `file:${dbFile.split(path.sep).join("/")}`;
  process.env.TURSO_DATABASE_URL = url;
  process.env.TURSO_AUTH_TOKEN = "";
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const client = createClient({ url });
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  client.close();
}
