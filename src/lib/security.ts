import { headers } from "next/headers";
import type { Session } from "next-auth";
import { db } from "@/db";
import { consents, type ConsentType } from "@/db/schema";

// Versões dos documentos legais — mude ao alterar /termos ou /privacidade para exigir novo aceite.
export const TERMS_VERSION = "1.0-2026-09-12";
export const PRIVACY_VERSION = "1.0-2026-09-12";
export const COOKIE_CONSENT_NAME = "ahl_consent";
export const COOKIE_CONSENT_MAX_AGE = 60 * 60 * 24 * 180; // 6 meses

/**
 * Só aceita caminhos internos (evita open redirect via callbackUrl/next).
 * Bloqueia `//host` e `/\host` — navegadores tratam `\` como `/`.
 */
export function safeInternalPath(url: string | null | undefined, fallback: string) {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return fallback;
  return url;
}

/** IP e user-agent da requisição atual (atrás de proxy usa x-forwarded-for). */
export async function requestMeta() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip") ?? "")?.trim() || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 500) ?? null };
}

/** Registro de consentimento/solicitação do titular (LGPD art. 8º §2º: ônus da prova é do controlador). */
export async function recordConsent(input: {
  type: ConsentType;
  version: string;
  email?: string | null;
  userId?: string | null;
  meta?: Record<string, unknown>;
}) {
  const { ip, userAgent } = await requestMeta();
  await db.insert(consents).values({
    type: input.type,
    version: input.version,
    email: input.email?.toLowerCase() ?? null,
    userId: input.userId ?? null,
    ip,
    userAgent,
    meta: input.meta ?? null,
  });
}

type Actor = Session["user"] | null | undefined;

function sameEmail(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Quem pode ver um orçamento: admin, o usuário dono, o usuário logado com o mesmo e-mail do cliente,
 * ou quem tem o token do link (solicitante sem conta).
 */
export function canAccessQuote(
  q: { userId: string | null; accessToken: string | null; customer?: { email: string | null } | null },
  user: Actor,
  token?: string | null,
) {
  if (user?.role === "admin") return true;
  if (user && q.userId && q.userId === user.id) return true;
  if (user && sameEmail(user.email, q.customer?.email)) return true;
  if (token && q.accessToken && safeEqual(token, q.accessToken)) return true;
  return false;
}

export function canAccessOrder(
  o: { userId: string | null; customerEmail: string; accessToken: string | null },
  user: Actor,
  token?: string | null,
) {
  if (user?.role === "admin") return true;
  if (user && o.userId && o.userId === user.id) return true;
  if (user && sameEmail(user.email, o.customerEmail)) return true;
  if (token && o.accessToken && safeEqual(token, o.accessToken)) return true;
  return false;
}

export function canAccessTicket(
  t: { userId: string | null; email: string; accessToken: string | null },
  user: Actor,
  token?: string | null,
) {
  if (user?.role === "admin") return true;
  if (user && t.userId && t.userId === user.id) return true;
  if (user && sameEmail(user.email, t.email)) return true;
  if (token && t.accessToken && safeEqual(token, t.accessToken)) return true;
  return false;
}

/** Comparação em tempo constante para tokens. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
