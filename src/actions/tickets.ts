"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, ticketMessages, tickets, TICKET_CATEGORIES, TICKET_STATUS } from "@/db/schema";
import { auth, requirePermission } from "@/lib/auth";
import { canAccessTicket, PRIVACY_VERSION, recordConsent, TERMS_VERSION } from "@/lib/security";
import { saveUploads } from "@/lib/uploads";
import { humanNumber } from "@/lib/utils";
import { audit } from "@/lib/audit";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import type { ActionState } from "@/components/ui/form-message";

const openSchema = z.object({
  name: z.string().min(2, "Informe seu nome").max(120),
  email: z.email("E-mail inválido"),
  subject: z.string().min(3, "Informe o assunto").max(140),
  category: z.enum(TICKET_CATEGORIES),
  body: z.string().min(10, "Descreva com mais detalhes").max(5000),
  orderId: z.string().optional(),
  quoteId: z.string().optional(),
  acceptTerms: z.literal("on", { error: "É preciso aceitar os Termos de Uso e a Política de Privacidade" }),
});

/** Abre um chamado (logado ou não). Convidado acessa pelo token do link. */
export async function openTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = openSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const email = d.email.toLowerCase();
  try {
    await assertRateLimit("ticket:ip", 10, 60 * 60_000, { byIp: true });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: "Muitos chamados em pouco tempo. Tente novamente mais tarde." };
    throw err;
  }
  const session = await auth();
  const ownerId = session?.user?.email?.toLowerCase() === email ? session.user.id : null;

  let customer = await db.query.customers.findFirst({ where: eq(customers.email, email) });
  if (!customer) {
    [customer] = await db.insert(customers).values({ name: d.name, email, stage: "lead", source: "ajuda", userId: ownerId }).returning();
  }

  const [ticket] = await db
    .insert(tickets)
    .values({
      number: humanNumber("CHM"),
      userId: ownerId,
      customerId: customer.id,
      name: d.name,
      email,
      subject: d.subject,
      category: d.category,
      orderId: d.orderId || null,
      quoteId: d.quoteId || null,
      lastCustomerMessageAt: new Date(),
    })
    .returning();
  const [msg] = await db.insert(ticketMessages).values({ ticketId: ticket.id, authorId: ownerId, authorName: d.name, body: d.body, fromAdmin: false }).returning();
  const up = await saveUploads(formData, "ticket_message", msg.id, ownerId);
  await recordConsent({ type: "terms", version: TERMS_VERSION, email, userId: ownerId, meta: { source: "ticket", ticketId: ticket.id } });
  await recordConsent({ type: "privacy", version: PRIVACY_VERSION, email, userId: ownerId, meta: { source: "ticket", ticketId: ticket.id } });

  await audit({ action: "ticket.opened", channel: "customer", entityType: "ticket", entityId: ticket.id, summary: `Chamado ${ticket.number}: ${d.subject} (${d.category})`, actor: { id: ownerId, email, role: "customer" } });
  revalidatePath("/admin/chamados");
  revalidatePath("/admin");
  const target = ownerId ? `/ajuda/chamados/${ticket.id}` : `/ajuda/chamados/${ticket.id}?t=${ticket.accessToken}`;
  redirect(up.rejected.length ? `${target}${target.includes("?") ? "&" : "?"}aviso=${encodeURIComponent(up.rejected.join("; "))}` : target);
}

export async function customerTicketReplyAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId"));
  const token = (formData.get("t") as string) || null;
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!t) return;
  const session = await auth();
  if (!canAccessTicket(t, session?.user, token)) return;
  if (!body && !formData.getAll("files").some((f) => f instanceof File && f.size > 0)) return;
  const [msg] = await db.insert(ticketMessages).values({ ticketId, authorId: session?.user?.id ?? null, authorName: session?.user?.name ?? t.name, body: body || "(anexo)", fromAdmin: false }).returning();
  await saveUploads(formData, "ticket_message", msg.id, session?.user?.id);
  await db.update(tickets).set({ status: t.status === "closed" ? "open" : t.status === "pending" ? "open" : t.status, lastCustomerMessageAt: new Date() }).where(eq(tickets.id, ticketId));
  await audit({ action: "ticket.customer_reply", channel: "customer", entityType: "ticket", entityId: ticketId, summary: `Resposta do cliente em ${t.number}`, actor: { id: session?.user?.id, email: session?.user?.email ?? t.email, role: "customer" } });
  revalidatePath(`/ajuda/chamados/${ticketId}`);
  revalidatePath(`/admin/chamados/${ticketId}`);
  revalidatePath("/admin/chamados");
}

export async function adminTicketReplyAction(formData: FormData) {
  const session = await requirePermission("tickets.manage");
  const ticketId = String(formData.get("ticketId"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);
  const isInternal = formData.get("isInternal") === "on";
  const nextStatus = formData.get("status") ? z.enum(TICKET_STATUS).parse(formData.get("status")) : null;
  if (body || formData.getAll("files").some((f) => f instanceof File && f.size > 0)) {
    const [msg] = await db.insert(ticketMessages).values({ ticketId, authorId: session.user.id, authorName: session.user.name ?? "AHL Studio", body: body || "(anexo)", fromAdmin: true, isInternal }).returning();
    await saveUploads(formData, "ticket_message", msg.id, session.user.id);
  }
  const patch: Partial<typeof tickets.$inferInsert> = {};
  if (body && !isInternal) patch.lastAdminMessageAt = new Date();
  if (nextStatus) patch.status = nextStatus;
  else if (body && !isInternal) patch.status = "pending";
  if (Object.keys(patch).length) await db.update(tickets).set(patch).where(eq(tickets.id, ticketId));
  await audit({ action: isInternal ? "ticket.internal_note" : "ticket.admin_reply", entityType: "ticket", entityId: ticketId, summary: `${isInternal ? "Nota interna" : "Resposta ao cliente"}${nextStatus ? ` · status → ${nextStatus}` : ""}` });
  revalidatePath(`/ajuda/chamados/${ticketId}`);
  revalidatePath(`/admin/chamados/${ticketId}`);
  revalidatePath("/admin/chamados");
  revalidatePath("/admin");
}

export async function setTicketStatusAction(formData: FormData) {
  await requirePermission("tickets.manage");
  const ticketId = String(formData.get("ticketId"));
  const status = z.enum(TICKET_STATUS).parse(formData.get("status"));
  const priority = formData.get("priority") != null ? Number(formData.get("priority")) : undefined;
  await db.update(tickets).set({ status, ...(priority != null && !Number.isNaN(priority) ? { priority } : {}) }).where(eq(tickets.id, ticketId));
  await audit({ action: "ticket.status_changed", entityType: "ticket", entityId: ticketId, summary: `Chamado → ${status}`, meta: { status, priority } });
  revalidatePath(`/ajuda/chamados/${ticketId}`);
  revalidatePath(`/admin/chamados/${ticketId}`);
  revalidatePath("/admin/chamados");
}
