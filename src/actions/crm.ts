"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, interactions, CUSTOMER_STAGES, INTERACTION_TYPES } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";

const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome obrigatório"),
  email: z.string().optional(),
  phone: z.string().optional(),
  document: z.string().optional(),
  instagram: z.string().optional(),
  stage: z.enum(CUSTOMER_STAGES),
  source: z.string().optional(),
  tags: z.string().optional(), // separadas por vírgula
  notes: z.string().optional(),
});

export async function saveCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("customers.manage");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const email = d.email?.trim().toLowerCase() || null;

  if (email) {
    const clash = await db.query.customers.findFirst({
      where: d.id ? and(eq(customers.email, email), ne(customers.id, d.id)) : eq(customers.email, email),
    });
    if (clash) return { error: "Já existe um cliente com este e-mail" };
  }

  const values = {
    name: d.name,
    email,
    phone: d.phone || null,
    document: d.document || null,
    instagram: d.instagram?.replace(/^@/, "") || null,
    stage: d.stage,
    source: d.source || null,
    tags: (d.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    notes: d.notes || null,
  };

  let id = d.id;
  if (id) await db.update(customers).set(values).where(eq(customers.id, id));
  else [{ id }] = await db.insert(customers).values(values).returning({ id: customers.id });

  await audit({ action: d.id ? "customer.updated" : "customer.created", entityType: "customer", entityId: id, summary: `Cliente "${d.name}" (${d.stage})` });
  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${id}`);
  if (!d.id) redirect(`/admin/clientes/${id}`);
  return { ok: true, message: "Cliente salvo" };
}

export async function deleteCustomerAction(formData: FormData) {
  await requirePermission("customers.manage");
  await db.delete(customers).where(eq(customers.id, String(formData.get("id"))));
  await audit({ action: "customer.deleted", entityType: "customer", entityId: String(formData.get("id")), summary: "Cliente excluído", level: "warn" });
  revalidatePath("/admin/clientes");
  redirect("/admin/clientes");
}

const interactionSchema = z.object({
  customerId: z.string(),
  type: z.enum(INTERACTION_TYPES),
  content: z.string().min(1, "Escreva algo"),
  followUpAt: z.string().optional(),
});

export async function addInteractionAction(formData: FormData) {
  const session = await requirePermission("customers.manage");
  const parsed = interactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const d = parsed.data;
  await db.insert(interactions).values({
    customerId: d.customerId,
    authorId: session.user.id,
    type: d.type,
    content: d.content,
    followUpAt: d.followUpAt ? new Date(d.followUpAt) : null,
  });
  await audit({ action: "customer.interaction_added", entityType: "customer", entityId: d.customerId, summary: `Contato registrado (${d.type})` });
  revalidatePath(`/admin/clientes/${d.customerId}`);
  revalidatePath("/admin");
}

export async function deleteInteractionAction(formData: FormData) {
  await requirePermission("customers.manage");
  const id = String(formData.get("id"));
  const customerId = String(formData.get("customerId"));
  await db.delete(interactions).where(eq(interactions.id, id));
  revalidatePath(`/admin/clientes/${customerId}`);
}
