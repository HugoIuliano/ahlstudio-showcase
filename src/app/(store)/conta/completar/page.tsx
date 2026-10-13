import Image from "next/image";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { safeInternalPath } from "@/lib/security";
import { CompleteProfileForm } from "@/components/store/account-forms";

export const metadata = { title: "Complete seu cadastro", robots: { index: false } };

/** Destino do login social. Se o cadastro já tem WhatsApp, segue direto para `next`. */
export default async function CompleteProfilePage({ searchParams }: { searchParams: Promise<{ next?: string; force?: string }> }) {
  const { next: rawNext, force } = await searchParams;
  const next = safeInternalPath(rawNext, "/conta");
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/conta/completar?next=${encodeURIComponent(next)}`)}`);
  const me = await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { name: true, email: true, phone: true } });
  if (!me) redirect("/login");
  if (me.phone && !force) redirect(next);

  return (
    <div className="mx-auto max-w-md">
      <div className="text-center">
        <Image src="/brand/logo-icon.png" alt="" width={96} height={96} className="mx-auto size-20" />
        <h1 className="mt-4 text-2xl font-semibold">Quase lá, {me.name?.split(" ")[0] ?? "bem-vindo"}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sua conta Google foi conectada. Confirme seu nome e deixe um WhatsApp para a gente te avisar sobre orçamentos, produção e entrega.</p>
      </div>
      <div className="mt-6 rounded-3xl border bg-card p-6">
        <CompleteProfileForm user={me} next={next} />
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Ao usar o Google você já aceitou os Termos de Uso e a Política de Privacidade; o aceite ficou registrado na sua conta (LGPD).</p>
    </div>
  );
}
