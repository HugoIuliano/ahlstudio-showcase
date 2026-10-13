import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignupForm } from "@/components/store/auth-forms";

export const metadata = { title: "Criar conta" };

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect("/conta");
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold">Criar conta</h1>
      <p className="mb-6 text-sm text-muted-foreground">Acompanhe pedidos e orçamentos em um só lugar.</p>
      <div className="rounded-2xl border bg-card p-6">
        <SignupForm googleEnabled={!!process.env.AUTH_GOOGLE_ID} />
      </div>
    </div>
  );
}
