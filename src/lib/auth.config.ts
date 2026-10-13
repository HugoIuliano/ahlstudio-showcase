import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { UserRole } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    role?: UserRole;
  }
}

/**
 * Config "leve" (sem banco) usada pelo proxy.ts para checagens otimistas de sessão.
 * A config completa com adapter + credentials fica em auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({ allowDangerousEmailAccountLinking: true })]
      : []),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "customer";
      }
      if (trigger === "update" && session?.role) token.role = session.role;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = (token.role as UserRole) ?? "customer";
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const isStaff = !!auth?.user?.role && auth.user.role !== "customer";
      if (pathname.startsWith("/admin")) return isStaff;
      if (pathname.startsWith("/conta")) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;
