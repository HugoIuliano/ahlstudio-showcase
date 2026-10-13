import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Factory } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, ORDER_STATUS, PAYMENT_STATUS } from "@/db/schema";
import { orderStatusLabels, paymentMethodLabels, paymentStatusLabels, printJobStatusLabels, shippingMethodLabels } from "@/lib/labels";
import { providerPanelUrl } from "@/lib/shipping-providers";
import { addBusinessDays } from "@/lib/production";
import { getSetting } from "@/lib/settings";
import { centsToInput, formatBRL } from "@/lib/money";
import { whatsappLink } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { createPrintJobsFromOrderAction, updateOrderNotesAction, updateOrderStatusAction, updatePaymentStatusAction } from "@/actions/orders";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("orders.view");
  const shippingProvider = await getSetting("shipping_provider");
  const { id } = await params;
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      items: { with: { product: true } },
      events: { orderBy: (e, { desc }) => desc(e.createdAt) },
      customer: true,
      printJobs: { with: { printer: true } },
    },
  });
  if (!order) notFound();
  const wa = whatsappLink(order.customerPhone ?? "", `Olá ${order.customerName.split(" ")[0]}! Sobre seu pedido ${order.number} na AHL Studio…`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Pedido ${order.number}`}
        description={`${formatDate(order.createdAt, true)} · ${paymentMethodLabels[order.paymentMethod]}${order.mpPaymentId ? ` · MP #${order.mpPaymentId}` : ""}`}
        actions={
          <>
            <StatusBadge value={order.status} map={orderStatusLabels} />
            <StatusBadge value={order.paymentStatus} map={paymentStatusLabels} />
            <Link href={`/pedido/${order.id}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-muted"><ExternalLink className="size-4" /> Página do cliente</Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y text-sm">
                {order.items.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="flex-1">
                      <p className="font-medium">{i.product ? <Link href={`/admin/produtos/${i.product.id}`} className="hover:underline">{i.name}</Link> : i.name}</p>
                      <p className="text-muted-foreground">{i.quantity} × {formatBRL(i.unitPriceCents)}{i.variantLabel ? ` · ${i.variantLabel}` : ""}</p>
                      {i.customization && <p className="mt-1 rounded bg-custard/60 px-2 py-1 text-xs">Personalização: {i.customization}</p>}
                      {i.quoteId && <Link href={`/admin/orcamentos/${i.quoteId}`} className="text-xs text-muted-foreground hover:underline">ver orçamento</Link>}
                    </div>
                    <span className="font-medium">{formatBRL(i.totalCents)}</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1 border-t px-5 py-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatBRL(order.subtotalCents)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Frete · {order.shippingService ?? shippingMethodLabels[order.shippingMethod]}{order.shippingCarrier && order.shippingMethod === "correios" ? ` (${order.shippingCarrier})` : ""}{order.shippingDaysMax != null && order.shippingMethod !== "pickup" ? ` · ${order.shippingDaysMin}–${order.shippingDaysMax} d.u.` : ""}</dt><dd>{formatBRL(order.shippingCents)}</dd></div>
                {order.discountCents > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Desconto</dt><dd>-{formatBRL(order.discountCents)}</dd></div>}
                <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{formatBRL(order.totalCents)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Produção</CardTitle>
              <form action={createPrintJobsFromOrderAction}>
                <input type="hidden" name="id" value={order.id} />
                <Button type="submit" variant="secondary" size="sm"><Factory /> Enviar itens para a fila</Button>
              </form>
            </CardHeader>
            <CardContent className="p-0">
              {order.printJobs.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum job de impressão ainda.</p> : (
                <ul className="divide-y text-sm">
                  {order.printJobs.map((j) => (
                    <li key={j.id} className="flex items-center gap-3 px-5 py-2.5">
                      <Link href="/admin/producao" className="flex-1 hover:underline">{j.title}</Link>
                      <span className="text-muted-foreground">{j.printer?.name ?? "sem máquina"}</span>
                      <StatusBadge value={j.status} map={printJobStatusLabels} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Linha do tempo</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {order.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-32 shrink-0 text-xs text-muted-foreground">{formatDate(e.createdAt, true)}</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{order.customer ? <Link href={`/admin/clientes/${order.customer.id}`} className="hover:underline">{order.customerName}</Link> : order.customerName}</p>
              <p className="text-muted-foreground">{order.customerEmail}</p>
              {order.customerPhone && <p className="text-muted-foreground">{order.customerPhone}</p>}
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-block pt-1 text-emerald-700 hover:underline">Abrir WhatsApp</a>}
              {order.shippingAddress && (
                <p className="mt-2 border-t pt-2 text-muted-foreground">
                  {order.shippingAddress.street}, {order.shippingAddress.number}{order.shippingAddress.complement ? ` – ${order.shippingAddress.complement}` : ""}<br />
                  {order.shippingAddress.district ? `${order.shippingAddress.district}, ` : ""}{order.shippingAddress.city}/{order.shippingAddress.state} · {order.shippingAddress.zip}
                  {order.shippingAddress.reference && <><br />Ref.: {order.shippingAddress.reference}</>}
                </p>
              )}
              {order.shippingMethod === "correios" && <a href={providerPanelUrl(shippingProvider)} target="_blank" rel="noreferrer" className="inline-block pt-1 text-primary-strong hover:underline">Emitir etiqueta no provedor ↗</a>}
              {order.customerNotes && <p className="mt-2 rounded bg-muted p-2 text-xs">Obs. do cliente: {order.customerNotes}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Atualizar</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form action={updateOrderStatusAction} className="flex items-end gap-2">
                <input type="hidden" name="id" value={order.id} />
                <div className="flex-1">
                  <Label>Status do pedido</Label>
                  <Select name="status" defaultValue={order.status}>{ORDER_STATUS.map((s) => <option key={s} value={s}>{orderStatusLabels[s].label}</option>)}</Select>
                </div>
                <Button type="submit" variant="secondary">OK</Button>
              </form>
              <form action={updatePaymentStatusAction} className="flex items-end gap-2">
                <input type="hidden" name="id" value={order.id} />
                <div className="flex-1">
                  <Label>Pagamento</Label>
                  <Select name="paymentStatus" defaultValue={order.paymentStatus}>{PAYMENT_STATUS.map((s) => <option key={s} value={s}>{paymentStatusLabels[s].label}</option>)}</Select>
                </div>
                <Button type="submit" variant="secondary">OK</Button>
              </form>
              <form action={updateOrderNotesAction} className="space-y-3">
                <input type="hidden" name="id" value={order.id} />
                <div>
                  <Label>Código de rastreio</Label>
                  <Input name="trackingCode" defaultValue={order.trackingCode ?? ""} />
                </div>
                <div>
                  <Label>Prazo de produção (dias úteis)</Label>
                  <Input name="productionDays" type="number" min={0} max={90} defaultValue={order.productionDays} />
                  <p className="mt-1 text-xs text-muted-foreground">Estimado no checkout pelos itens a imprimir. Pronto até {formatDate(addBusinessDays(order.paidAt ?? order.createdAt, order.productionDays))}{order.shippingDaysMax != null && order.shippingMethod !== "pickup" ? `; entrega prevista até ${formatDate(addBusinessDays(order.paidAt ?? order.createdAt, order.shippingDaysMax))}` : ""}.</p>
                </div>
                <div>
                  <Label>Custo real do frete (R$)</Label>
                  <Input name="shippingCost" defaultValue={centsToInput(order.shippingCostCents)} placeholder="0,00" />
                  <p className="mt-1 text-xs text-muted-foreground">Etiqueta paga na SuperFrete ou custo da entrega. Cobrado do cliente: {formatBRL(order.shippingCents)} · {order.shippingCents - order.shippingCostCents >= 0 ? "sobra" : "subsídio"} {formatBRL(Math.abs(order.shippingCents - order.shippingCostCents))}. Entra no COGS do mês.</p>
                </div>
                <div>
                  <Label>Notas internas</Label>
                  <Textarea name="adminNotes" defaultValue={order.adminNotes ?? ""} className="min-h-20" />
                </div>
                <Button type="submit" variant="outline" className="w-full">Salvar notas</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
