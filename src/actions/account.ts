"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { addresses, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { safeInternalPath } from "@/lib/security";
import { normalizeCep } from "@/lib/shipping";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import type { ActionState } from "@/components/ui/form-message";

// Perfil e endereços do cliente logado (/conta). Tudo escopado pelo userId da sessão — nunca por id vindo do formulário.

const profileSchema = z.object({
  name: z.string().min(2, "Informe seu nome").max(120),
  phone: z.string().max(30).optional(),
  document: z.string().max(20).optional(),
});

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const phone = d.phone?.replace(/[^\d+() -]/g, "").trim() || null;
  if (phone && phone.replace(/\D/g, "").length < 10) return { error: "WhatsApp inválido — use DDD + número" };
  const document = d.document?.replace(/\D/g, "") || null;
  if (document && document.length !== 11 && document.length !== 14) return { error: "CPF/CNPJ inválido" };

  await db.update(users).set({ name: d.name.trim(), phone, document }).where(eq(users.id, session.user.id));
  // mantém o CRM em sincronia
  const customer = await db.query.customers.findFirst({ where: eq(customers.userId, session.user.id) });
  if (customer) await db.update(customers).set({ name: d.name.trim(), phone, document }).where(eq(customers.id, customer.id));
  await audit({ action: "account.profile_updated", channel: "customer", entityType: "user", entityId: session.user.id, summary: "Cliente atualizou nome/WhatsApp/documento", meta: { hasPhone: !!phone, hasDocument: !!document } });
  revalidatePath("/conta");
  return { ok: true, message: "Dados atualizados" };
}

/** Passo pós-login social: WhatsApp obrigatório (é como avisamos produção/entrega), CPF opcional. Redireciona para `next` (só caminho relativo). */
export async function completeProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const phone = String(formData.get("phone") ?? "").trim();
  if (phone.replace(/\D/g, "").length < 10) return { error: "Informe seu WhatsApp com DDD — é por ele que avisamos sobre produção e entrega" };
  const res = await updateProfileAction(null, formData);
  if (res?.error) return res;
  const next = String(formData.get("next") ?? "/conta");
  redirect(safeInternalPath(next, "/conta"));
}

const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().max(40).optional(),
  recipient: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  zip: z.string().min(8, "CEP obrigatório"),
  street: z.string().min(2, "Rua obrigatória").max(200),
  number: z.string().min(1, "Número obrigatório").max(20),
  complement: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  city: z.string().min(2, "Cidade obrigatória").max(100),
  state: z.string().length(2, "UF com 2 letras"),
  reference: z.string().max(200).optional(),
  isDefault: z.string().optional(),
});

export async function saveAddressAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser();
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const zip = normalizeCep(d.zip);
  if (!zip) return { error: "CEP inválido" };

  const mine = await db.query.addresses.findMany({ where: eq(addresses.userId, session.user.id) });
  if (!d.id && mine.length >= 10) return { error: "Limite de 10 endereços" };
  const isDefault = d.isDefault === "on" || mine.length === 0;
  const values = {
    userId: session.user.id,
    label: d.label?.trim() || "Casa",
    recipient: d.recipient?.trim() || session.user.name || null,
    phone: d.phone?.trim() || null,
    zip,
    street: d.street.trim(),
    number: d.number.trim(),
    complement: d.complement?.trim() || null,
    district: d.district?.trim() || null,
    city: d.city.trim(),
    state: d.state.trim().toUpperCase(),
    reference: d.reference?.trim() || null,
    isDefault,
  };
  if (isDefault) await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, session.user.id));
  if (d.id) {
    const own = mine.find((a) => a.id === d.id);
    if (!own) return { error: "Endereço não encontrado" };
    await db.update(addresses).set(values).where(and(eq(addresses.id, d.id), eq(addresses.userId, session.user.id)));
  } else {
    await db.insert(addresses).values(values);
  }
  await audit({ action: d.id ? "account.address_updated" : "account.address_created", channel: "customer", entityType: "address", entityId: d.id, summary: `Endereço "${values.label}" · ${values.city}/${values.state}` });
  revalidatePath("/conta");
  revalidatePath("/checkout");
  return { ok: true, message: d.id ? "Endereço salvo" : "Endereço adicionado" };
}

export async function deleteAddressAction(formData: FormData) {
  const session = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, session.user.id)));
  const rest = await db.query.addresses.findMany({ where: eq(addresses.userId, session.user.id) });
  if (rest.length && !rest.some((a) => a.isDefault)) await db.update(addresses).set({ isDefault: true }).where(eq(addresses.id, rest[0].id));
  await audit({ action: "account.address_deleted", channel: "customer", entityType: "address", entityId: id, summary: "Endereço removido" });
  revalidatePath("/conta");
  revalidatePath("/checkout");
}

export async function setDefaultAddressAction(formData: FormData) {
  const session = await requireUser();
  const id = String(formData.get("id") ?? "");
  const own = await db.query.addresses.findFirst({ where: and(eq(addresses.id, id), eq(addresses.userId, session.user.id)) });
  if (!own) return;
  await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, session.user.id));
  await db.update(addresses).set({ isDefault: true }).where(eq(addresses.id, id));
  revalidatePath("/conta");
  revalidatePath("/checkout");
}

/** Endereço por CEP (ViaCEP, público) para pré-preencher formulários. */
export async function lookupCepAction(cepInput: string): Promise<{ street?: string; district?: string; city?: string; state?: string; error?: string }> {
  const cep = normalizeCep(cepInput);
  if (!cep) return { error: "CEP inválido" };
  try {
    await assertRateLimit("cep:lookup", 60, 10 * 60_000, { byIp: true });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: "Muitas consultas. Aguarde um minuto." };
    throw err;
  }
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
    const j = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (!res.ok || j.erro) return { error: "CEP não encontrado" };
    return { street: j.logradouro, district: j.bairro, city: j.localidade, state: j.uf };
  } catch {
    return { error: "Não foi possível consultar o CEP agora" };
  }
}
