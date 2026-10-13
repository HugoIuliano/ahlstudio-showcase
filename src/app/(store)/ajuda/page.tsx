import Link from "next/link";
import { faqLd, jsonLd } from "@/lib/seo";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { orders, quotes, tickets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { ticketStatusLabels } from "@/lib/labels";
import { getSettings, whatsappLink } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { TicketForm } from "@/components/store/ticket-form";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Central de ajuda", description: "Prazos, personalizados, frete, pagamento, trocas e LGPD — respostas rápidas e abertura de chamado.", alternates: { canonical: "/ajuda" } };

const FAQ: { q: string; a: string }[] = [
  { q: "Quanto tempo demora um pedido?", a: "Peças em estoque saem em até 1 dia útil. Peças sob demanda ou personalizadas dependem do tempo de produção informado na página do produto ou no orçamento — normalmente de 2 a 7 dias úteis, mais o prazo de entrega." },
  { q: "Como funciona o projeto personalizado?", a: "Você descreve a ideia em Personalizados (pode anexar fotos, desenhos ou arquivo 3D). Em até 2 dias úteis enviamos uma proposta com preço e prazo. Se aprovar, o item aparece no seu carrinho como produto exclusivo e você paga no checkout." },
  { q: "Quais materiais vocês usam?", a: "Principalmente PLA e PETG (rígidos), TPU (flexível) e resina para detalhes finos. Se não souber qual escolher, deixe em 'me indique' que a gente orienta." },
  { q: "Posso pedir uma cor ou medida diferente de um produto do catálogo?", a: "Sim. Na página do produto, use 'Personalize' ou peça um orçamento citando o produto — o briefing já vem pré-preenchido." },
  { q: "Formas de pagamento", a: "PIX, cartão de crédito e boleto pelo Mercado Pago. Em alguns casos usamos PIX direto com confirmação manual — a chave aparece na página do pedido." },
  { q: "Trocas, devoluções e arrependimento", a: "Itens de catálogo: até 7 dias corridos após o recebimento (CDC, art. 49). Itens personalizados: cancelamento até o início da produção; depois, garantimos apenas defeitos de fabricação. Veja os Termos de Uso." },
  { q: "Como acompanho meu pedido?", a: "Pelo link enviado na confirmação ou em Minha conta → Meus pedidos. Envios pelos Correios ganham código de rastreio." },
  { q: "Meus dados e privacidade", a: "Em Minha conta você baixa uma cópia dos seus dados e pode excluir a conta a qualquer momento. Detalhes na Política de Privacidade." },
];

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ pedido?: string; orcamento?: string; categoria?: string }> }) {
  const sp = await searchParams;
  const [session, s] = await Promise.all([auth(), getSettings()]);
  const email = session?.user?.email?.toLowerCase() ?? "";

  const [myTickets, myOrders, myQuotes] = session?.user
    ? await Promise.all([
        db.query.tickets.findMany({ where: or(eq(tickets.userId, session.user.id), eq(tickets.email, email)), orderBy: desc(tickets.updatedAt), limit: 20 }),
        db.query.orders.findMany({ where: or(eq(orders.userId, session.user.id), eq(orders.customerEmail, email)), orderBy: desc(orders.createdAt), columns: { id: true, number: true }, limit: 20 }),
        db.query.quotes.findMany({ where: eq(quotes.userId, session.user.id), orderBy: desc(quotes.createdAt), columns: { id: true, number: true, title: true }, limit: 20 }),
      ])
    : [[], [], []];
  const wa = whatsappLink(s.shop_whatsapp, "Oi! Preciso de ajuda com a loja.");

  return (
    <div className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd(FAQ)) }} />
      <div className="rounded-3xl bg-gradient-to-br from-custard via-blush to-rose p-8 md:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Central de ajuda</p>
        <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Como podemos ajudar?</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">Respostas rápidas abaixo. Não achou? Abra um chamado — respondemos por aqui e você acompanha tudo com histórico e anexos.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href="#chamado" className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 font-semibold text-blush"><LifeBuoy className="size-4" /> Abrir chamado</a>
          {wa && <a href={wa} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-700"><MessageCircle className="size-4" /> WhatsApp</a>}
        </div>
      </div>

      <section className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <h2 className="mb-4 text-2xl font-semibold">Perguntas frequentes</h2>
          <div className="divide-y rounded-2xl border bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium marker:content-none [&::-webkit-details-marker]:hidden">{f.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Veja também: <Link href="/termos" className="underline">Termos de Uso</Link> · <Link href="/privacidade" className="underline">Política de Privacidade</Link></p>
        </div>

        <aside className="space-y-4">
          {session?.user && (
            <Card>
              <CardHeader><CardTitle>Meus chamados</CardTitle></CardHeader>
              <CardContent className="p-0">
                {myTickets.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum chamado aberto.</p> : (
                  <ul className="divide-y text-sm">
                    {myTickets.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link href={`/ajuda/chamados/${t.id}`} className="block truncate font-medium hover:underline">{t.subject}</Link>
                          <span className="text-xs text-muted-foreground">{t.number} · {formatDate(t.updatedAt)}</span>
                        </div>
                        <StatusBadge value={t.status} map={ticketStatusLabels} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </section>

      <section id="chamado" className="rounded-3xl border bg-card p-5 sm:p-7">
        <h2 className="text-2xl font-semibold">Abrir um chamado</h2>
        <p className="mb-5 text-sm text-muted-foreground">{session?.user ? "Seu chamado fica em Minha conta e aqui na Central de ajuda." : "Você receberá um link para acompanhar. Se tiver conta, entre antes para ver tudo em um lugar."}</p>
        <TicketForm defaults={{ name: session?.user?.name, email: session?.user?.email }} orders={myOrders} quotes={myQuotes} preset={{ orderId: sp.pedido, quoteId: sp.orcamento, category: sp.categoria }} />
      </section>
    </div>
  );
}
