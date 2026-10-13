/**
 * Promove um usuário a admin e/ou redefine a senha dele.
 *   npm run make-admin -- email@dominio.com            → promove a admin
 *   npm run make-admin -- email@dominio.com --reset    → promove e gera senha forte nova (impressa no console)
 *   npm run make-admin -- email@dominio.com --demote   → volta para customer
 * Único caminho para conceder acesso ao backoffice — o cadastro público nunca cria admin.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import * as schema from "./schema";
import { generateStrongPassword } from "../lib/password";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const db = drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined }), { schema });

async function main() {
  const [email, ...flags] = process.argv.slice(2);
  if (!email) {
    console.error("uso: npm run make-admin -- email [--reset] [--demote]");
    process.exit(1);
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
  if (!user) {
    console.error(`usuário não encontrado: ${email} (peça para a pessoa criar a conta no site primeiro)`);
    process.exit(1);
  }
  const role = flags.includes("--demote") ? "customer" : "admin";
  const patch: Partial<typeof schema.users.$inferInsert> = { role };
  let newPassword: string | null = null;
  if (flags.includes("--reset")) {
    newPassword = generateStrongPassword(18);
    patch.passwordHash = await hash(newPassword, 12);
  }
  await db.update(schema.users).set(patch).where(eq(schema.users.id, user.id));
  console.log(`✔ ${email} agora é ${role} (banco: ${url.startsWith("file:") ? "local" : "Turso"})`);
  if (newPassword) console.log(`✔ nova senha: ${newPassword}\n  (troque em /conta > Segurança depois de entrar)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
