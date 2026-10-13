/**
 * Setup global dos testes de integração ("UAT automatizado"):
 *  - banco SQLite descartável (tests/.tmp/test.db) com as migrations reais de ./drizzle
 *  - mocks de next/headers, next/cache, next/navigation e @/lib/auth (sessão controlada por tests/ctx.ts)
 * As server actions e libs rodam de verdade contra o banco.
 */
import { vi } from "vitest";
import { ctx, RedirectError } from "./ctx";

delete process.env.MP_ACCESS_TOKEN; // checkout em modo PIX manual (sem chamada externa)

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": ctx.ip, "user-agent": "vitest", referer: "http://test.local/pagina?t=segredo" }),
  cookies: async () => ({
    get: (name: string) => (ctx.cookies.has(name) ? { name, value: ctx.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void ctx.cookies.set(name, value),
    delete: (name: string) => void ctx.cookies.delete(name),
    getAll: () => [...ctx.cookies.entries()].map(([name, value]) => ({ name, value })),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/auth", async () => {
  const { can, isStaff } = await import("@/lib/rbac");
  const { RedirectError } = await import("./ctx");
  const auth = async () => ctx.session;
  return {
    auth,
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    handlers: {},
    getStaffSession: async () => (ctx.session && isStaff(ctx.session.user.role) ? ctx.session : null),
    getAdminSession: async () => (ctx.session?.user.role === "admin" ? ctx.session : null),
    requirePermission: async (perm: Parameters<typeof can>[1]) => {
      if (!ctx.session || !can(ctx.session.user.role, perm)) throw new Error("Não autorizado");
      return ctx.session;
    },
    requirePagePermission: async (perm: Parameters<typeof can>[1]) => {
      if (!ctx.session) throw new RedirectError("/login?callbackUrl=/admin");
      if (!can(ctx.session.user.role, perm)) throw new RedirectError("/admin?negado=1");
      return ctx.session;
    },
    requireAdmin: async () => {
      if (ctx.session?.user.role !== "admin") throw new Error("Não autorizado");
      return ctx.session;
    },
    requireUser: async () => {
      if (!ctx.session) throw new Error("Faça login para continuar");
      return ctx.session;
    },
  };
});

// next-auth puxa next/server no import; nas actions só usamos a classe de erro
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
  default: () => ({}),
}));
