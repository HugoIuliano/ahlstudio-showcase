import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { safeInternalPath } from "@/lib/security";
import { LoginForm } from "@/components/store/auth-forms";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const session = await auth();
  if (session?.user) redirect(session.user.role !== "customer" ? "/admin" : "/conta");

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <p className="mb-6 text-sm text-muted-foreground">Acesse seus pedidos e orçamentos.</p>
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Não foi possível entrar. Tente novamente.</p>}
      <div className="rounded-2xl border bg-card p-6">
        <LoginForm callbackUrl={safeInternalPath(callbackUrl, "/conta")} googleEnabled={!!process.env.AUTH_GOOGLE_ID} />
      </div>
    </div>
  );
}
