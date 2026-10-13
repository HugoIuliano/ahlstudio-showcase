/**
 * Contexto mutável compartilhado pelos mocks (sessão, IP, cookies).
 * Os testes alteram `ctx` para simular quem está logado e de onde vem a requisição.
 */
import type { UserRole } from "@/db/schema";

export type TestSession = { user: { id: string; email: string; name: string; role: UserRole } } | null;

export const ctx: { session: TestSession; ip: string; cookies: Map<string, string> } = {
  session: null,
  ip: "203.0.113.10",
  cookies: new Map(),
};

export function asGuest() {
  ctx.session = null;
}
export function asUser(user: { id: string; email: string; name?: string; role?: UserRole }) {
  ctx.session = { user: { id: user.id, email: user.email, name: user.name ?? "Teste", role: user.role ?? "customer" } };
}
export function resetCtx() {
  ctx.session = null;
  ctx.ip = "203.0.113.10";
  ctx.cookies.clear();
}

/** Erro lançado pelo mock de redirect() — mesmo digest que o Next usa. */
export class RedirectError extends Error {
  digest: string;
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
    this.digest = `NEXT_REDIRECT;replace;${url};307;`;
  }
}

export async function expectRedirect(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof RedirectError) return e.url;
    throw e;
  }
  throw new Error("esperava redirect");
}
