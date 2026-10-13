import { headers } from "next/headers";
import { db } from "@/db";
import { auditLogs, type AuditChannel, type AuditLevel } from "@/db/schema";
import { auth } from "./auth";

type AuditInput = {
  action: string;
  summary: string;
  channel?: AuditChannel;
  level?: AuditLevel;
  entityType?: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  /** Sobrescreve o ator (ex.: login falho — não há sessão). */
  actor?: { id?: string | null; email?: string | null; role?: string | null };
};

/**
 * Registra um evento de auditoria. Nunca lança: falha de log não pode derrubar a ação.
 * Canal é inferido do papel do ator quando não informado.
 */
export async function audit(input: AuditInput) {
  try {
    let actor = input.actor;
    if (!actor) {
      const session = await auth().catch(() => null);
      actor = session?.user ? { id: session.user.id, email: session.user.email, role: session.user.role } : {};
    }
    let ip: string | null = null;
    let userAgent: string | null = null;
    let path: string | null = null;
    try {
      const h = await headers();
      const fwd = h.get("x-forwarded-for");
      ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip") ?? "")?.trim() || null;
      userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
      path = h.get("referer")?.replace(/^https?:\/\/[^/]+/, "").split("?")[0].slice(0, 200) ?? null;
    } catch {
      // fora de request (jobs/scripts)
    }
    const channel: AuditChannel = input.channel ?? (actor.role && actor.role !== "customer" ? "backoffice" : actor.id || actor.email ? "customer" : "system");
    await db.insert(auditLogs).values({
      channel,
      level: input.level ?? "info",
      action: input.action,
      actorId: actor.id ?? null,
      actorEmail: actor.email?.toLowerCase() ?? null,
      actorRole: actor.role ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary.slice(0, 500),
      meta: input.meta ?? null,
      ip,
      userAgent,
      path,
    });
  } catch (err) {
    console.error("audit failed", input.action, err);
  }
}

/** Log de sistema (erros de integração, webhooks, falhas). */
export async function systemLog(level: AuditLevel, action: string, summary: string, meta?: Record<string, unknown>) {
  return audit({ channel: "system", level, action, summary, meta, actor: {} });
}
