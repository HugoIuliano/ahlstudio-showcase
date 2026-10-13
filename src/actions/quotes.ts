"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, products, quoteMessages, quotes, QUOTE_STATUS } from "@/db/schema";
import { auth, requirePermission } from "@/lib/auth";
import { lineKey, readCartLines, writeCartLines } from "@/lib/cart";
import { parseBRLToCents } from "@/lib/money";
import { bomGrams, bomMaterialCents } from "@/lib/production";
import { saveUploads } from "@/lib/uploads";
import { canAccessQuote, PRIVACY_VERSION, recordConsent, TERMS_VERSION } from "@/lib/security";
import { humanNumber } from "@/lib/utils";
import { audit } from "@/lib/audit";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import type { ActionState } from "@/components/ui/form-message";

// ---------- lado do cliente ----------
const requestSchema = z.object({
  name: z.string().min(2, "Informe seu nome").max(120),
  email: z.email("E-mail inválido"),
  phone: z.string().min(8, "Informe um telefone/WhatsApp").max(30),
  title: z.string().min(3, "Dê um título ao projeto").max(140),
  description: z.string().min(10, "Descreva o projeto com mais detalhes").max(5000),
  referenceLinks: z.string().max(3000).optional(),
  quantity: z.coerce.number().int().min(1).max(10000).default(1),
  desiredMaterial: z.string().max(40).optional(),
  desiredColor: z.string().max(60).optional(),
  dimensions: z.string().max(80).optional(),
  deadline: z.string().max(80).optional(),
  productId: z.string().optional(), // item personalizado do catálogo
  structured: z.string().max(500).optional(), // resumo estruturado (tipo/uso/acabamento)
  acceptTerms: z.literal("on", { error: "É preciso aceitar os Termos de Uso e a Política de Privacidade" }),
});

export async function requestQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const email = d.email.toLowerCase();
  try {
    await assertRateLimit("quote:ip", 10, 60 * 60_000, { byIp: true });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: "Muitos pedidos de orçamento em pouco tempo. Tente novamente mais tarde." };
    throw err;
  }
  const session = await auth();

  let customer = await db.query.customers.findFirst({ where: eq(customers.email, email) });
  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({ name: d.name, email, phone: d.phone, stage: "lead", source: "site", userId: session?.user?.id ?? null })
      .returning();
  }

  const links = (d.referenceLinks ?? "")
    .split(/\s+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l))
    .slice(0, 10);

  // Se logado com o mesmo e-mail, o orçamento fica vinculado à conta; senão, acesso pelo token do link.
  const ownerId = session?.user?.email?.toLowerCase() === email ? session.user.id : null;

  // Item personalizado do catálogo: pré-estima material/tempo/custo a partir da ficha técnica
  const base = d.productId ? await db.query.products.findFirst({ where: eq(products.id, d.productId), with: { bom: { with: { material: true } } } }) : null;
  const estimatedGrams = base ? (base.bom.length ? bomGrams(base.bom) : base.materialGrams) : null;
  const estimatedMinutes = base ? base.printMinutes : null;
  const costCents = base ? (base.costCents || bomMaterialCents(base.bom, base.bom.map((l) => l.material))) * d.quantity : null;

  const [quote] = await db
    .insert(quotes)
    .values({
      number: humanNumber("ORC"),
      customerId: customer.id,
      userId: ownerId,
      productId: base?.id ?? null,
      materialId: base?.materialId ?? null,
      estimatedGrams,
      estimatedMinutes,
      costCents,
      title: d.title,
      description: d.structured ? `${d.description}

— ${d.structured}` : d.description,
      referenceLinks: links,
      quantity: d.quantity,
      desiredMaterial: d.desiredMaterial || null,
      desiredColor: d.desiredColor || null,
      dimensions: d.dimensions || null,
      deadline: d.deadline || null,
    })
    .returning();

  // Arquivos de referência enviados junto viram a primeira mensagem da conversa
  if (formData.getAll("files").some((f) => f instanceof File && f.size > 0)) {
    const [msg] = await db.insert(quoteMessages).values({ quoteId: quote.id, authorId: ownerId, authorName: d.name, body: "Arquivos de referência", isInternal: false }).returning();
    await saveUploads(formData, "quote_message", msg.id, ownerId);
  }
  await recordConsent({ type: "terms", version: TERMS_VERSION, email, userId: ownerId, meta: { source: "quote_request", quoteId: quote.id } });
  await recordConsent({ type: "privacy", version: PRIVACY_VERSION, email, userId: ownerId, meta: { source: "quote_request", quoteId: quote.id } });

  await audit({ action: "quote.requested", channel: "customer", entityType: "quote", entityId: quote.id, summary: `Orçamento ${quote.number} solicitado: ${d.title}`, actor: { id: ownerId, email, role: "customer" }, meta: { productId: base?.id ?? null, quantity: d.quantity } });
  redirect(ownerId ? `/orcamento/${quote.id}` : `/orcamento/${quote.id}?t=${quote.accessToken}`);
}

/** Carrega o orçamento e confere se quem chama pode agir sobre ele. */
async function loadAccessibleQuote(quoteId: string, token: string | null) {
  const q = await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId), with: { customer: true } });
  if (!q) return null;
  const session = await auth();
  if (!canAccessQuote(q, session?.user, token)) return null;
  return { q, session };
}

export async function customerQuoteMessageAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId"));
  const token = (formData.get("t") as string) || null;
  const body = String(formData.get("body") ?? "").trim().slice(0, 3000);
  const hasFiles = formData.getAll("files").some((f) => f instanceof File && f.size > 0);
  if (!body && !hasFiles) return;
  const ctx = await loadAccessibleQuote(quoteId, token);
  if (!ctx) return;
  const authorName = ctx.session?.user?.name ?? ctx.q.customer?.name ?? "Cliente";
  const [msg] = await db.insert(quoteMessages).values({ quoteId, body: body || "(anexo)", authorId: ctx.session?.user?.id ?? null, authorName, isInternal: false }).returning();
  if (hasFiles) await saveUploads(formData, "quote_message", msg.id, ctx.session?.user?.id);
  await audit({ action: "quote.customer_message", channel: "customer", entityType: "quote", entityId: quoteId, summary: `Mensagem do cliente em ${ctx.q.number}${hasFiles ? " (com anexo)" : ""}`, actor: { id: ctx.session?.user?.id, email: ctx.session?.user?.email ?? ctx.q.customer?.email, role: "customer" } });
  revalidatePath(`/orcamento/${quoteId}`);
  revalidatePath(`/admin/orcamentos/${quoteId}`);
}

/**
 * Cliente aceita a proposta: o orçamento entra no carrinho como item personalizado
 * (visível só para ele) e segue pelo checkout normal (frete + pagamento).
 * Exige login: o item fica atrelado à conta.
 */
export async function addQuoteToCartAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId"));
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/orcamento/${quoteId}`)}`);
  const q = await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId), with: { customer: true } });
  if (!q || !canAccessQuote(q, session.user) || q.status !== "quoted" || !q.priceCents) return;
  if (q.validUntil && q.validUntil < new Date()) return;

  const lines = await readCartLines();
  const key = lineKey({ quoteId });
  if (!lines.some((l) => lineKey(l) === key)) lines.push({ quoteId, quantity: 1 });
  await writeCartLines(lines);
  await audit({ action: "quote.added_to_cart", channel: "customer", entityType: "quote", entityId: quoteId, summary: `Cliente aceitou ${q.number} (R$ ${(q.priceCents / 100).toFixed(2)})` });
  revalidatePath("/", "layout");
  redirect("/carrinho");
}

export async function rejectQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quoteId"));
  const token = (formData.get("t") as string) || null;
  const ctx = await loadAccessibleQuote(quoteId, token);
  if (!ctx || ctx.q.status !== "quoted") return;
  await db.update(quotes).set({ status: "rejected" }).where(eq(quotes.id, quoteId));
  await db.insert(quoteMessages).values({ quoteId, body: "Orçamento recusado pelo cliente.", authorName: "Sistema" });
  await audit({ action: "quote.rejected", channel: "customer", entityType: "quote", entityId: quoteId, summary: `Cliente recusou ${ctx.q.number}`, actor: { id: ctx.session?.user?.id, email: ctx.session?.user?.email ?? ctx.q.customer?.email, role: "customer" } });
  revalidatePath(`/orcamento/${quoteId}`);
  revalidatePath(`/admin/orcamentos/${quoteId}`);
}

// ---------- lado do admin ----------
const adminQuoteSchema = z.object({
  id: z.string(),
  status: z.enum(QUOTE_STATUS),
  materialId: z.string().optional(),
  estimatedGrams: z.coerce.number().int().min(0).optional(),
  estimatedMinutes: z.coerce.number().int().min(0).optional(),
  costCents: z.string().optional(),
  priceCents: z.string().optional(),
  validUntil: z.string().optional(),
  adminNotes: z.string().optional(),
});

export async function adminUpdateQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("quotes.manage");
  const parsed = adminQuoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const priceCents = parseBRLToCents(d.priceCents);
  if (d.status === "quoted" && priceCents <= 0) return { error: "Informe o preço antes de marcar como orçado" };

  const before = await db.query.quotes.findFirst({ where: eq(quotes.id, d.id) });
  await db
    .update(quotes)
    .set({
      status: d.status,
      materialId: d.materialId || null,
      estimatedGrams: d.estimatedGrams ?? null,
      estimatedMinutes: d.estimatedMinutes ?? null,
      costCents: parseBRLToCents(d.costCents),
      priceCents,
      validUntil: d.validUntil ? new Date(d.validUntil) : null,
      adminNotes: d.adminNotes || null,
    })
    .where(eq(quotes.id, d.id));

  if (before && before.status !== "quoted" && d.status === "quoted") {
    await db.insert(quoteMessages).values({
      quoteId: d.id,
      body: `Orçamento enviado: ${(priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para ${before.quantity} un. Você já pode adicionar ao carrinho e finalizar a compra.`,
      authorName: "AHL Studio",
    });
  }
  await audit({ action: "quote.updated", entityType: "quote", entityId: d.id, summary: `Orçamento ${before?.number ?? ""} → ${d.status}${priceCents ? ` · R$ ${(priceCents / 100).toFixed(2)}` : ""}`, meta: { status: d.status, priceCents, costCents: parseBRLToCents(d.costCents) } });
  revalidatePath(`/admin/orcamentos/${d.id}`);
  revalidatePath(`/orcamento/${d.id}`);
  revalidatePath("/admin/orcamentos");
  revalidatePath("/conta");
  return { ok: true, message: "Orçamento salvo" };
}

export async function adminQuoteMessageAction(formData: FormData) {
  const session = await requirePermission("quotes.manage");
  const quoteId = String(formData.get("quoteId"));
  const body = String(formData.get("body") ?? "").trim().slice(0, 3000);
  const isInternal = formData.get("isInternal") === "on";
  const hasFiles = formData.getAll("files").some((f) => f instanceof File && f.size > 0);
  if (!body && !hasFiles) return;
  const [msg] = await db.insert(quoteMessages).values({ quoteId, body: body || "(anexo)", isInternal, authorId: session.user.id, authorName: session.user.name ?? "AHL Studio" }).returning();
  if (hasFiles) await saveUploads(formData, "quote_message", msg.id, session.user.id);
  await audit({ action: isInternal ? "quote.internal_note" : "quote.admin_message", entityType: "quote", entityId: quoteId, summary: isInternal ? "Nota interna" : `Resposta ao cliente${hasFiles ? " (com anexo)" : ""}` });
  revalidatePath(`/admin/orcamentos/${quoteId}`);
  revalidatePath(`/orcamento/${quoteId}`);
}
