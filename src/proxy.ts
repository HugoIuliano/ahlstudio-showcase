import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Checagem otimista via cookie JWT (sem banco). A autorização real acontece nas pages/actions.
// O callback `authorized` em auth.config decide redirecionar para /login.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/admin/:path*", "/conta/:path*"],
};
