import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, MessageCircle, MessageSquareText, ShoppingCart, Sparkles } from "lucide-react";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { addresses, consents, customers, orders, quotes, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { orderStatusLabels, paymentStatusLabels, quoteStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { addQuoteToCartAction } from "@/actions/quotes";
import { getSettings, whatsappLink } from "@/lib/settings";
import { AddressBook, DeleteAccountForm, ProfileForm } from "@/components/store/account-forms";
import { ChangePasswordForm } from "@/components/store/auth-forms";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata = { title: "Minha conta" };

const consentLabels: Record<string, string> = {
  terms: "Aceite dos Termos de Uso",
  privacy: "Aceite da Política de Privacidade",
  cookies: "Preferência de cookies",
  deletion_request: "Exclusão de conta",
  export_request: "Download dos dados (portabilidade)",
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/conta");
  const email = (session.user.email ?? "").toLowerCase();

  const [customer, s, me, myAddresses] = await Promise.all([
    email ? db.query.customers.findFirst({ where: eq(customers.email, email) }) : null,
    getSettings(),
    db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { name: true, email: true, phone: true, document: true } }),
    db.query.addresses.findMany({ where: eq(addresses.userId, session.user.id), orderBy: [desc(addresses.isDefault), asc(addresses.createdAt)] }),
  ]);

  const [myOrders, myQuotes, myConsents] = await Promise.all([
    db.query.orders.findMany({
      where: or(eq(orders.userId, session.user.id), eq(orders.customerEmail, email)),
      orderBy: desc(orders.createdAt),
      with: { items: true },
    }),
    db.query.quotes.findMany({
      where: customer ? or(eq(quotes.userId, session.user.id), eq(quotes.customerId, customer.id)) : eq(quotes.userId, session.user.id),
      orderBy: desc(quotes.createdAt),
    }),
    db.query.consents.findMany({ where: and(eq(consents.email, email)), orderBy: desc(consents.createdAt), limit: 20 }),
  ]);

  const readyToBuy = myQuotes.filter((q) => q.status === "quoted" && q.priceCents && (!q.validUntil || q.validUntil > new Date()));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Olá, {session.user.name?.split(" ")[0] ?? "cliente"}</h1>
        <p className="text-sm text-muted-foreground">{email}{session.user.role !== "customer" && <> · <Link href="/admin" className="font-medium underline">Painel administrativo</Link></>}</p>
      </div>

      {!me?.phone && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="flex-1">Seu cadastro está incompleto: falta o <strong>WhatsApp</strong>, que usamos para avisar sobre orçamentos, produção e entrega.</span>
          <Link href="/conta/completar?next=%2Fconta" className="inline-flex h-9 items-center rounded-lg bg-foreground px-3 font-semibold text-blush">Completar cadastro</Link>
        </div>
      )}

      {/* Itens personalizados prontos para comprar — visíveis só para este usuário */}
      {readyToBuy.length > 0 && (
        <section className="rounded-3xl bg-canary p-5 text-accent-foreground">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5" /> Seus itens exclusivos estão prontos</h2>
          <p className="text-sm text-accent-foreground/80">Orçamentos aprovados pelo studio. Só você vê estes itens.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {readyToBuy.map((q) => (
              <li key={q.id} className="flex items-center gap-3 rounded-2xl bg-white/80 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/orcamento/${q.id}`} className="block truncate font-semibold hover:underline">{q.title}</Link>
                  <p className="text-sm text-muted-foreground">{q.quantity} un. · {formatBRL(q.priceCents)}{q.validUntil ? ` · válido até ${formatDate(q.validUntil)}` : ""}</p>
                </div>
                <form action={addQuoteToCartAction}>
                  <input type="hidden" name="quoteId" value={q.id} />
                  <SubmitButton size="sm" pendingText="…"><ShoppingCart /> Comprar</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="pedidos">
          <CardHeader><CardTitle>Meus pedidos</CardTitle></CardHeader>
          <CardContent>
            {myOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não fez pedidos. <Link href="/produtos" className="text-primary-strong hover:underline">Ver catálogo</Link></p>
            ) : (
              <ul className="divide-y">
                {myOrders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/pedido/${o.id}`} className="font-medium hover:underline">{o.number}</Link>
                      <p className="truncate text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                    </div>
                    <span className="text-muted-foreground">{formatDate(o.createdAt)}</span>
                    <StatusBadge value={o.status} map={orderStatusLabels} />
                    <StatusBadge value={o.paymentStatus} map={paymentStatusLabels} />
                    <span className="w-24 text-right font-medium">{formatBRL(o.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card id="orcamentos">
          <CardHeader><CardTitle>Meus orçamentos</CardTitle></CardHeader>
          <CardContent>
            {myQuotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum orçamento. <Link href="/projetos" className="text-primary-strong hover:underline">Pedir projeto personalizado</Link></p>
            ) : (
              <ul className="divide-y">
                {myQuotes.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/orcamento/${q.id}`} className="font-medium hover:underline">{q.title}</Link>
                      <p className="text-muted-foreground">{q.number}</p>
                    </div>
                    <StatusBadge value={q.status} map={quoteStatusLabels} />
                    <span className="w-20 text-right font-medium">{q.priceCents ? formatBRL(q.priceCents) : "—"}</span>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Link href={`/orcamento/${q.id}#conversa`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-medium hover:bg-muted"><MessageSquareText className="size-3.5" /> Mensagens</Link>
                      {s.shop_whatsapp && (
                        <a href={whatsappLink(s.shop_whatsapp, `Oi! Sobre meu orçamento ${q.number} (${q.title})…`) ?? "#"} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700"><MessageCircle className="size-3.5" /> WhatsApp</a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="dados">
          <CardHeader><CardTitle>Meus dados</CardTitle><p className="text-sm text-muted-foreground">Nome, WhatsApp e documento usados nos pedidos.</p></CardHeader>
          <CardContent><ProfileForm user={me ?? { name: session.user.name ?? null, email, phone: null, document: null }} /></CardContent>
        </Card>
        <Card id="seguranca">
          <CardHeader><CardTitle>Segurança</CardTitle></CardHeader>
          <CardContent><ChangePasswordForm /></CardContent>
        </Card>
      </div>

      <Card id="enderecos">
        <CardHeader><CardTitle>Meus endereços</CardTitle><p className="text-sm text-muted-foreground">Até 10 endereços. O principal já vem selecionado no checkout, com o frete calculado.</p></CardHeader>
        <CardContent><AddressBook addresses={myAddresses} /></CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Seus dados (LGPD)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Baixe uma cópia completa dos seus dados ou exclua sua conta na hora, sem falar com o suporte (Lei 13.709/2018, art. 18). Veja a{" "}
            <Link href="/privacidade" className="underline">Política de Privacidade</Link> e os <Link href="/termos" className="underline">Termos de Uso</Link>.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <a href="/api/me/export" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted">
            <Download className="size-4" /> Baixar meus dados agora (JSON)
          </a>
          <DeleteAccountForm />
          {myConsents.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registro de consentimentos</p>
              <ul className="divide-y rounded-xl border text-sm">
                {myConsents.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="flex-1">{consentLabels[c.type] ?? c.type}{c.type === "cookies" && c.meta && "choice" in c.meta ? ` (${c.meta.choice === "all" ? "todos" : "essenciais"})` : ""}</span>
                    <span className="text-xs text-muted-foreground">v{c.version} · {formatDate(c.createdAt, true)}{c.ip ? ` · IP ${c.ip}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
