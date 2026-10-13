import Link from "next/link";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { interactions, materials, orders, printJobs, quotes, tickets } from "@/db/schema";
import { orderStatusLabels, printJobStatusLabels, quoteStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";

export default async function AdminDashboard() {
  await requirePagePermission("dashboard.view");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const followUpUntil = new Date(now.getTime() + 86400000 * 2);
  const followUpSince = new Date(now.getTime() - 86400000 * 30);

  const [revenue, openOrders, newQuotes, lowStock, queue, followUps, recentOrders] = await Promise.all([
    db.select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`, n: sql<number>`count(*)` }).from(orders).where(and(eq(orders.paymentStatus, "approved"), gte(orders.paidAt, monthStart))),
    db.query.orders.findMany({ where: inArray(orders.status, ["paid", "in_production"]), orderBy: desc(orders.createdAt), limit: 8 }),
    db.query.quotes.findMany({ where: inArray(quotes.status, ["new", "reviewing"]), orderBy: desc(quotes.createdAt), limit: 6, with: { customer: true } }),
    db.query.materials.findMany({ where: and(eq(materials.active, true), lte(materials.stockGrams, materials.minStockGrams)) }),
    db.query.printJobs.findMany({ where: inArray(printJobs.status, ["queued", "printing"]), orderBy: [desc(printJobs.priority), printJobs.createdAt], limit: 6, with: { printer: true } }),
    db.query.interactions.findMany({ where: and(lte(interactions.followUpAt, followUpUntil), gte(interactions.followUpAt, followUpSince)), with: { customer: true }, limit: 6 }),
    db.query.orders.findMany({ orderBy: desc(orders.createdAt), limit: 6 }),
  ]);

  const pendingPayment = await db.select({ n: sql<number>`count(*)` }).from(orders).where(eq(orders.status, "pending_payment"));
  const openTickets = await db.query.tickets.findMany({ where: eq(tickets.status, "open"), orderBy: desc(tickets.updatedAt), limit: 6 });

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`Visão geral · ${formatDate(now)}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Receita no mês" value={formatBRL(revenue[0]?.total ?? 0)} hint={`${revenue[0]?.n ?? 0} pedidos pagos`} />
        <Stat label="Aguardando pagamento" value={pendingPayment[0]?.n ?? 0} tone={pendingPayment[0]?.n ? "warning" : undefined} />
        <Stat label="Para produzir" value={openOrders.length} hint="pagos ou em produção" />
        <Stat label="Orçamentos abertos" value={newQuotes.length} tone={newQuotes.length ? "warning" : undefined} />
        <Stat label="Materiais em baixa" value={lowStock.length} tone={lowStock.length ? "danger" : undefined} />
        <Stat label="Chamados abertos" value={openTickets.length} tone={openTickets.length ? "warning" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Pedidos para produzir</CardTitle>
            <Link href="/admin/pedidos" className="text-xs text-muted-foreground hover:underline">ver todos</Link>
          </CardHeader>
          <CardContent className="p-0">
            {openOrders.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nada pendente. 🎉</p> : (
              <ul className="divide-y text-sm">
                {openOrders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">{o.number}</Link>
                    <span className="flex-1 truncate text-muted-foreground">{o.customerName}</span>
                    <StatusBadge value={o.status} map={orderStatusLabels} />
                    <span className="w-24 text-right">{formatBRL(o.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Orçamentos aguardando</CardTitle>
            <Link href="/admin/orcamentos" className="text-xs text-muted-foreground hover:underline">ver todos</Link>
          </CardHeader>
          <CardContent className="p-0">
            {newQuotes.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum orçamento novo.</p> : (
              <ul className="divide-y text-sm">
                {newQuotes.map((q) => (
                  <li key={q.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Link href={`/admin/orcamentos/${q.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{q.title}</Link>
                    <span className="truncate text-muted-foreground">{q.customer?.name}</span>
                    <StatusBadge value={q.status} map={quoteStatusLabels} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Fila de produção</CardTitle>
            <Link href="/admin/producao" className="text-xs text-muted-foreground hover:underline">abrir fila</Link>
          </CardHeader>
          <CardContent className="p-0">
            {queue.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Fila vazia.</p> : (
              <ul className="divide-y text-sm">
                {queue.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="min-w-0 flex-1 truncate">{j.title}</span>
                    <span className="text-muted-foreground">{j.printer?.name ?? "—"}</span>
                    <StatusBadge value={j.status} map={printJobStatusLabels} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Alertas</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {lowStock.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-danger">Estoque baixo</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {lowStock.map((m) => <li key={m.id}><Link href="/admin/estoque" className="hover:underline">{m.name}</Link> — {m.stockGrams}g (mín. {m.minStockGrams}g)</li>)}
                </ul>
              </div>
            )}
            {followUps.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-amber-700">Follow-ups próximos</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {followUps.map((f) => <li key={f.id}><Link href={`/admin/clientes/${f.customerId}`} className="hover:underline">{f.customer.name}</Link> · {formatDate(f.followUpAt)} — {f.content.slice(0, 60)}</li>)}
                </ul>
              </div>
            )}
            {openTickets.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-amber-700">Chamados aguardando resposta</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {openTickets.map((t) => <li key={t.id}><Link href={`/admin/chamados/${t.id}`} className="hover:underline">{t.number}</Link> · {t.subject}</li>)}
                </ul>
              </div>
            )}
            {lowStock.length === 0 && followUps.length === 0 && openTickets.length === 0 && <p className="text-muted-foreground">Sem alertas.</p>}
            <div className="border-t pt-3">
              <p className="mb-1 font-medium">Últimos pedidos</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {recentOrders.map((o) => <li key={o.id}><Link href={`/admin/pedidos/${o.id}`} className="hover:underline">{o.number}</Link> · {o.customerName} · {formatBRL(o.totalCents)}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
