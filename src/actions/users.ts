"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, USER_ROLES } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import type { ActionState } from "@/components/ui/form-message";

const schema = z.object({ id: z.string(), role: z.enum(USER_ROLES), active: z.string().optional() });

/** Gestão de papéis (RBAC) — só admin. Ninguém rebaixa/bloqueia a si mesmo nem remove o último admin. */
export async function updateUserRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("users.manage");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Dados inválidos" };
  const d = parsed.data;
  const active = d.active === "on";

  const target = await db.query.users.findFirst({ where: eq(users.id, d.id) });
  if (!target) return { error: "Usuário não encontrado" };
  if (target.id === session.user.id && (d.role !== "admin" || !active)) return { error: "Você não pode rebaixar ou bloquear a própria conta" };

  if (target.role === "admin" && (d.role !== "admin" || !active)) {
    const admins = await db.query.users.findMany({ where: eq(users.role, "admin"), columns: { id: true, active: true } });
    if (admins.filter((a) => a.active && a.id !== target.id).length === 0) return { error: "Precisa existir ao menos um administrador ativo" };
  }

  await db.update(users).set({ role: d.role, active }).where(eq(users.id, d.id));
  await audit({
    action: "user.role_changed",
    level: "warn",
    entityType: "user",
    entityId: d.id,
    summary: `${target.email}: ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[d.role]}${active ? "" : " (bloqueado)"}`,
    meta: { from: target.role, to: d.role, active },
  });
  revalidatePath("/admin/usuarios");
  return { ok: true, message: "Acesso atualizado" };
}
