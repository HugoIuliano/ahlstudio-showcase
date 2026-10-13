import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accounts, auditLogs, customers, sessions, users, verificationTokens } from "@/db/schema";
import { PRIVACY_VERSION, recordConsent, TERMS_VERSION } from "./security";
import { authConfig } from "./auth.config";
import { can, isStaff, type Permission } from "./rbac";

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1).max(128) });

// Log direto (sem headers) para eventos de autenticação — roda dentro do handler do Auth.js.
async function authLog(action: string, summary: string, actor: { id?: string | null; email?: string | null; role?: string | null }, level: "info" | "warn" = "info") {
  try {
    await db.insert(auditLogs).values({ channel: "customer", level, action, summary, actorId: actor.id ?? null, actorEmail: actor.email?.toLowerCase() ?? null, actorRole: actor.role ?? null, entityType: "user", entityId: actor.id ?? null });
  } catch (err) {
    console.error("auth log failed", err);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "E-mail e senha",
      credentials: { email: { label: "E-mail", type: "email" }, password: { label: "Senha", type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const user = await db.query.users.findFirst({ where: eq(users.email, email) });
        // compara mesmo sem usuário para não vazar existência por tempo de resposta
        const ok = await compare(parsed.data.password, user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
        if (!user?.passwordHash || !ok) {
          await authLog("auth.login_failed", `Login falhou para ${email}`, { email }, "warn");
          return null;
        }
        if (!user.active) {
          await authLog("auth.login_blocked", `Login bloqueado (conta inativa) para ${email}`, { id: user.id, email, role: user.role }, "warn");
          return null;
        }
        return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
      },
    }),
  ],
  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user.id) return;
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      // Primeiro acesso via Google: vira cliente no CRM e registra o aceite de Termos/Privacidade (o botão informa que continuar = aceitar)
      if (isNewUser && account?.provider && account.provider !== "credentials") {
        const email = user.email?.toLowerCase();
        if (email) {
          const existing = await db.query.customers.findFirst({ where: eq(customers.email, email) });
          if (existing) await db.update(customers).set({ userId: user.id, stage: existing.stage === "lead" ? "active" : existing.stage }).where(eq(customers.id, existing.id));
          else await db.insert(customers).values({ userId: user.id, name: user.name ?? email, email, stage: "active", source: account.provider });
          await recordConsent({ type: "terms", version: TERMS_VERSION, email, userId: user.id, meta: { source: account.provider } }).catch(() => {});
          await recordConsent({ type: "privacy", version: PRIVACY_VERSION, email, userId: user.id, meta: { source: account.provider } }).catch(() => {});
        }
        await authLog("auth.signup", `Conta criada via ${account.provider}: ${user.email}`, { id: user.id, email: user.email, role: user.role });
      }
      await authLog("auth.login", `Login via ${account?.provider ?? "credentials"}`, { id: user.id, email: user.email, role: user.role });
    },
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      await authLog("auth.logout", "Logout", { id: token?.id as string | undefined, email: token?.email, role: token?.role as string | undefined });
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    // Papel sempre sincronizado com o banco (promoção/rebaixamento/bloqueio valem sem novo login).
    // Reconsulta no máximo a cada 60s para não pesar.
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      const id = (params.user?.id ?? token.id) as string | undefined;
      const checkedAt = (token.roleCheckedAt as number | undefined) ?? 0;
      if (id && (params.user || Date.now() - checkedAt > 60_000)) {
        const dbUser = await db.query.users.findFirst({ where: eq(users.id, id), columns: { role: true, active: true } });
        if (!dbUser || !dbUser.active) {
          token.role = "customer";
          token.blocked = true;
        } else {
          token.role = dbUser.role;
          token.blocked = false;
        }
        token.roleCheckedAt = Date.now();
      }
      return token;
    },
    async signIn({ user }) {
      // bloqueio de conta inativa também no login social
      if (!user.id) return true;
      const dbUser = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { active: true } });
      return dbUser?.active !== false;
    },
  },
});

/**
 * Sessão de equipe confirmada no BANCO (não só no JWT): rebaixar/bloquear tem efeito imediato.
 * Retorna a sessão com o papel atual do banco, ou null se não for equipe/estiver inativo.
 */
export async function getStaffSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { role: true, active: true } });
  if (!dbUser || !dbUser.active || !isStaff(dbUser.role)) return null;
  session.user.role = dbUser.role;
  return session;
}

/** Para server actions: lança se o papel atual não tiver a permissão. */
export async function requirePermission(permission: Permission) {
  const session = await getStaffSession();
  if (!session || !can(session.user.role, permission)) throw new Error("Não autorizado");
  return session;
}

/** Para pages do painel: redireciona para o dashboard se faltar permissão. */
export async function requirePagePermission(permission: Permission) {
  const session = await getStaffSession();
  if (!session) redirect("/login?callbackUrl=/admin");
  if (!can(session.user.role, permission)) redirect("/admin?negado=1");
  return session;
}

/** Compatibilidade: admin pleno. Prefira requirePermission(...). */
export async function requireAdmin() {
  const session = await getStaffSession();
  if (!session || session.user.role !== "admin") throw new Error("Não autorizado");
  return session;
}

export async function getAdminSession() {
  const session = await getStaffSession();
  return session && session.user.role === "admin" ? session : null;
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para continuar");
  return session;
}
