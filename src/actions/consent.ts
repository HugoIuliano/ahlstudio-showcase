"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, customers, interactions, orders, quotes, sessions, tickets, users } from "@/db/schema";
import { auth, requireUser, signOut } from "@/lib/auth";
import { COOKIE_CONSENT_MAX_AGE, COOKIE_CONSENT_NAME, PRIVACY_VERSION, recordConsent } from "@/lib/security";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";

/** Banner de cookies: grava a escolha num cookie e registra o consentimento (IP, e-mail se logado, timestamp). */
export async function cookieConsentAction(formData: FormData) {
  const choice = formData.get("choice") === "all" ? "all" : "essential";
  const session = await auth();
  (await cookies()).set(COOKIE_CONSENT_NAME, choice, { maxAge: COOKIE_CONSENT_MAX_AGE, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  await recordConsent({ type: "cookies", version: PRIVACY_VERSION, email: session?.user?.email, userId: session?.user?.id, meta: { choice } });
  revalidatePath("/", "layout");
}

/**
 * Exclusão da conta pelo próprio titular (LGPD art. 18, VI) — autoatendimento, sem suporte.
 * Pedidos e orçamentos são mantidos ANONIMIZADOS por obrigação fiscal/consumerista (CDC, art. 26; retenção de 5 anos),
 * mas deixam de identificar a pessoa. Conta, sessões e vínculos sociais são apagados.
 */
export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "EXCLUIR") return { error: 'Digite EXCLUIR para confirmar' };
  if (session.user.role === "admin") return { error: "Contas de administrador não podem se autoexcluir. Rebaixe o papel antes (make-admin --demote)." };

  const userId = session.user.id;
  const email = (session.user.email ?? "").toLowerCase();
  const anonEmail = `anonimizado-${userId.slice(0, 8)}@removido.local`;

  await recordConsent({ type: "deletion_request", version: PRIVACY_VERSION, email, userId, meta: { executed: "self-service-anonymization" } });
  await audit({ action: "account.deleted", channel: "customer", level: "warn", entityType: "user", entityId: userId, summary: `Titular excluiu a própria conta (${email}); registros comerciais anonimizados`, actor: { id: userId, email, role: session.user.role } });

  // Anonimiza registros comerciais mantidos por obrigação legal
  await db.update(orders).set({ customerName: "Cliente removido", customerEmail: anonEmail, customerPhone: null, shippingAddress: null, customerNotes: null, userId: null }).where(eq(orders.userId, userId));
  await db.update(orders).set({ customerName: "Cliente removido", customerEmail: anonEmail, customerPhone: null, shippingAddress: null, customerNotes: null }).where(eq(orders.customerEmail, email));
  await db.update(quotes).set({ userId: null }).where(eq(quotes.userId, userId));
  await db.update(tickets).set({ name: "Cliente removido", email: anonEmail, userId: null }).where(eq(tickets.userId, userId));
  await db.update(tickets).set({ name: "Cliente removido", email: anonEmail }).where(eq(tickets.email, email));

  // CRM: apaga o histórico de contato e anonimiza o cadastro
  const customer = await db.query.customers.findFirst({ where: eq(customers.email, email) });
  if (customer) {
    await db.delete(interactions).where(eq(interactions.customerId, customer.id));
    await db.update(customers).set({ name: "Cliente removido", email: anonEmail, phone: null, document: null, instagram: null, notes: null, tags: [], stage: "inactive", userId: null }).where(eq(customers.id, customer.id));
  }

  // Conta e credenciais
  await db.delete(accounts).where(eq(accounts.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  await signOut({ redirectTo: "/?conta=excluida" });
  return { ok: true };
}
