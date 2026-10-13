import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { quotes } from "@/db/schema";
import { auth } from "@/lib/auth";
import { quoteStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { canAccessQuote } from "@/lib/security";
import { getSettings, whatsappLink } from "@/lib/settings";
import { listAttachments } from "@/lib/uploads";
import { AttachmentList, FileInput } from "@/components/store/attachments";
import { formatDate } from "@/lib/utils";
import { addQuoteToCartAction, customerQuoteMessageAction, rejectQuoteAction } from "@/actions/quotes";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata = { title: "Orçamento" };

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  const [q, session, s] = await Promise.all([
    db.query.quotes.findFirst({
      where: eq(quotes.id, id),
      with: { customer: true, product: true, messages: { orderBy: (m, { asc }) => asc(m.createdAt) } },
    }),
    auth(),
    getSettings(),
  ]);
  if (!q) notFound();

  // Acesso: dono logado, e-mail do cliente na sessão, token do link, ou admin. Senão, login.
  if (!canAccessQuote(q, session?.user, t)) {
    if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/orcamento/${id}${t ? `?t=${t}` : ""}`)}`);
    notFound();
  }

  const publicMessages = q.messages.filter((m) => !m.isInternal);
  const files = await listAttachments("quote_message", publicMessages.map((m) => m.id));
  const wa = whatsappLink(s.shop_whatsapp, `Oi! Sobre meu orçamento ${q.number} (${q.title})…`);
  const expired = q.validUntil ? q.validUntil < new Date() : false;
  const loggedAsOwner = !!session?.user && canAccessQuote(q, session.user);
  const tokenParam = t ? `?t=${t}` : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Orçamento {q.number} · {formatDate(q.createdAt)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{q.title}</h1>
          <StatusBadge value={q.status} map={quoteStatusLabels} />
        </div>
        {q.product && <p className="text-sm text-muted-foreground">Baseado em: <Link href={`/produtos/${q.product.slug}`} className="underline">{q.product.name}</Link></p>}
      </div>

      {q.status === "new" && (
        <p className="rounded-2xl bg-custard/60 p-4 text-sm">Recebemos seu pedido! Vamos analisar e responder por aqui e pelo WhatsApp. Guarde este link.</p>
      )}

      {!session?.user && (
        <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          Dica: <Link href={`/cadastro`} className="font-medium text-foreground underline">crie sua conta</Link> com o e-mail <strong>{q.customer?.email}</strong> para ver este orçamento em "Minha conta" e comprar quando estiver pronto.
        </p>
      )}

      {q.status === "quoted" && q.priceCents && (
        <Card className="border-primary-strong/40 bg-blush/50">
          <CardHeader><CardTitle>Sua proposta está pronta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold">{formatBRL(q.priceCents)}</span>
              <span className="text-muted-foreground">para {q.quantity} un.</span>
            </div>
            {q.validUntil && <p className={`text-sm ${expired ? "text-danger" : "text-muted-foreground"}`}>{expired ? "Proposta expirada em" : "Válida até"} {formatDate(q.validUntil)}</p>}
            {q.estimatedMinutes ? <p className="text-sm text-muted-foreground">Tempo estimado de produção: {Math.round((q.estimatedMinutes / 60) * 10) / 10} h</p> : null}
            {!expired && (
              <div className="flex flex-wrap gap-2">
                {loggedAsOwner ? (
                  <form action={addQuoteToCartAction}>
                    <input type="hidden" name="quoteId" value={q.id} />
                    <SubmitButton size="lg" pendingText="Adicionando…"><ShoppingCart /> Adicionar ao carrinho</SubmitButton>
                  </form>
                ) : (
                  <Link href={`/login?callbackUrl=${encodeURIComponent(`/orcamento/${q.id}${tokenParam}`)}`} className="inline-flex h-12 items-center gap-2 rounded-lg bg-powder px-6 font-semibold hover:bg-primary-strong">
                    <ShoppingCart className="size-4" /> Entrar para comprar
                  </Link>
                )}
                <form action={rejectQuoteAction}>
                  <input type="hidden" name="quoteId" value={q.id} />
                  {t && <input type="hidden" name="t" value={t} />}
                  <Button type="submit" variant="outline" size="lg">Recusar</Button>
                </form>
              </div>
            )}
            <p className="text-xs text-muted-foreground">O item entra no carrinho como produto exclusivo seu; você escolhe a entrega e paga no checkout.</p>
          </CardContent>
        </Card>
      )}

      {q.status === "approved" && q.orderId && (
        <p className="rounded-2xl border bg-emerald-50 p-4 text-sm text-emerald-900">
          Orçamento aprovado. <Link href={`/pedido/${q.orderId}`} className="font-medium underline">Acompanhar pedido</Link>
        </p>
      )}

      <Card>
        <CardHeader><CardTitle>Seu pedido</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-line">{q.description}</p>
          <dl className="grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
            <div><dt className="text-xs uppercase">Qtd.</dt><dd className="text-foreground">{q.quantity}</dd></div>
            <div><dt className="text-xs uppercase">Material</dt><dd className="text-foreground">{q.desiredMaterial ?? "—"}</dd></div>
            <div><dt className="text-xs uppercase">Cor</dt><dd className="text-foreground">{q.desiredColor ?? "—"}</dd></div>
            <div><dt className="text-xs uppercase">Medidas</dt><dd className="text-foreground">{q.dimensions ?? "—"}</dd></div>
          </dl>
          {q.referenceLinks.length > 0 && (
            <ul className="space-y-1">
              {q.referenceLinks.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer noopener" className="break-all text-primary-strong hover:underline">{l}</a></li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="conversa">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Conversa</CardTitle>
          {wa && <a href={wa} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"><MessageCircle className="size-3.5" /> Chamar no WhatsApp</a>}
        </CardHeader>
        <CardContent className="space-y-4">
          {publicMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
          ) : (
            <ul className="space-y-3">
              {publicMessages.map((m) => (
                <li key={m.id} className="rounded-xl border bg-muted/40 p-3 text-sm">
                  <p className="mb-1 text-xs text-muted-foreground">{m.authorName ?? "—"} · {formatDate(m.createdAt, true)}</p>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <AttachmentList files={files.filter((f) => f.refId === m.id)} token={t} />
                </li>
              ))}
            </ul>
          )}
          {!["rejected", "cancelled"].includes(q.status) && (
            <form action={customerQuoteMessageAction} className="space-y-2">
              <input type="hidden" name="quoteId" value={q.id} />
              {t && <input type="hidden" name="t" value={t} />}
              <Textarea name="body" maxLength={3000} placeholder="Escreva uma mensagem ou envie mais detalhes…" className="min-h-20" />
              <FileInput />
              <SubmitButton variant="secondary" pendingText="Enviando…">Enviar mensagem</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
