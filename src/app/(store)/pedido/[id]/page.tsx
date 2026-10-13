import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { auth } from "@/lib/auth";
import { orderStatusLabels, paymentStatusLabels, shippingMethodLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { canAccessOrder } from "@/lib/security";
import { getSettings, whatsappLink } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { addBusinessDays } from "@/lib/production";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Pedido" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; t?: string }> }) {
  const { id } = await params;
  const { status: mpStatus, t } = await searchParams;
  const [order, s, session] = await Promise.all([
    db.query.orders.findFirst({ where: eq(orders.id, id), with: { items: true, events: { orderBy: (e, { desc }) => desc(e.createdAt) } } }),
    getSettings(),
    auth(),
  ]);
  if (!order) notFound();

  // Dados pessoais: só dono, e-mail da sessão, token do link (comprador convidado) ou admin.
  if (!canAccessOrder(order, session?.user, t)) {
    if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/pedido/${id}`)}`);
    notFound();
  }

  const awaitingPix = order.paymentMethod === "pix_manual" && order.paymentStatus === "pending";
  const wa = whatsappLink(s.shop_whatsapp, `Olá! Fiz o pedido ${order.number} no site e quero enviar o comprovante do PIX.`);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        {order.paymentStatus === "approved" ? <CheckCircle2 className="mx-auto size-12 text-emerald-600" /> : <Clock className="mx-auto size-12 text-amber-500" />}
        <h1 className="mt-3 text-2xl font-semibold">Pedido {order.number}</h1>
        <p className="mt-1 text-muted-foreground">
          {order.paymentStatus === "approved" ? "Pagamento confirmado! Já estamos cuidando da sua peça." : mpStatus === "failure" ? "O pagamento não foi concluído. Você pode tentar novamente." : "Recebemos seu pedido. Falta só o pagamento."}
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <StatusBadge value={order.status} map={orderStatusLabels} />
          <StatusBadge value={order.paymentStatus} map={paymentStatusLabels} />
        </div>
      </div>

      {awaitingPix && (
        <Card className="border-primary-strong/40 bg-blush/50">
          <CardHeader><CardTitle>Pague com PIX</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Transfira <strong>{formatBRL(order.totalCents)}</strong> para a chave abaixo e nos envie o comprovante. Assim que confirmarmos, a produção começa.</p>
            {s.pix_key ? (
              <div className="rounded-xl border bg-card p-3 font-mono text-sm break-all">{s.pix_key}</div>
            ) : (
              <p className="rounded-xl border border-dashed p-3 text-muted-foreground">Chave PIX ainda não configurada — entre em contato pelo WhatsApp para pagar.</p>
            )}
            {s.pix_holder && <p className="text-muted-foreground">Titular: {s.pix_holder}</p>}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer noopener" className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 font-medium text-white hover:bg-emerald-700">
                Enviar comprovante no WhatsApp
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-muted-foreground">{i.quantity} × {formatBRL(i.unitPriceCents)}{i.variantLabel ? ` · ${i.variantLabel}` : ""}</p>
                    {i.customization && <p className="text-xs text-muted-foreground">Personalização: {i.customization}</p>}
                    {i.quoteId && <Link href={`/orcamento/${i.quoteId}`} className="text-xs text-primary-strong hover:underline">ver orçamento</Link>}
                  </div>
                  <span>{formatBRL(i.totalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatBRL(order.subtotalCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Frete ({shippingMethodLabels[order.shippingMethod]})</dt><dd>{order.shippingCents ? formatBRL(order.shippingCents) : "Grátis"}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{formatBRL(order.totalCents)}</dd></div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Entrega</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{order.shippingService ?? shippingMethodLabels[order.shippingMethod]}{order.shippingCarrier && order.shippingMethod === "correios" ? <span className="font-normal text-muted-foreground"> · {order.shippingCarrier}</span> : null}</p>
              <p className="text-xs text-muted-foreground">
                Produção: {order.productionDays === 0 ? "pronta entrega" : `${order.productionDays} dia${order.productionDays === 1 ? "" : "s"} úteis`}
                {order.shippingDaysMax != null && order.shippingMethod !== "pickup" && ` · entrega: ${order.shippingDaysMin === order.shippingDaysMax ? order.shippingDaysMax : `${order.shippingDaysMin} a ${order.shippingDaysMax}`} dias úteis no total`}
                {" · previsão "}{order.shippingMethod === "pickup" ? "pronto" : "de entrega"} até <strong>{formatDate(addBusinessDays(order.paidAt ?? order.createdAt, order.shippingMethod === "pickup" ? order.productionDays : (order.shippingDaysMax ?? order.productionDays)))}</strong>{order.paidAt ? "" : " (contando a partir da confirmação do pagamento)"}
              </p>
              {order.shippingAddress ? (
                <p className="mt-1 text-muted-foreground">
                  {order.shippingAddress.street}, {order.shippingAddress.number}{order.shippingAddress.complement ? ` – ${order.shippingAddress.complement}` : ""}<br />
                  {order.shippingAddress.district ? `${order.shippingAddress.district}, ` : ""}{order.shippingAddress.city}/{order.shippingAddress.state} · {order.shippingAddress.zip}
                  {order.shippingAddress.reference && <><br />Ref.: {order.shippingAddress.reference}</>}
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">{s.shop_city ? `Retirada em ${s.shop_city}. ` : ""}Avisaremos quando estiver pronto.</p>
              )}
              {order.trackingCode && <p className="mt-2">Rastreio: <span className="font-mono">{order.trackingCode}</span></p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Acompanhamento</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {order.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{formatDate(e.createdAt, true)}</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {session?.user ? <Link href="/conta" className="text-primary-strong hover:underline">Ver meus pedidos</Link> : <>Guarde este link para acompanhar o pedido, ou <Link href="/cadastro" className="text-primary-strong hover:underline">crie sua conta</Link> com o e-mail {order.customerEmail}.</>}
      </p>
    </div>
  );
}
