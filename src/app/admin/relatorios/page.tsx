import Link from "next/link";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, materials, orderItems, orders, printJobs, quotes, stockMovements, tickets } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth";
import { inventoryValuation, lastMonths, monthPeriod, parseMonthKey } from "@/lib/finance";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { GroupedBars, HBars, SERIES } from "@/components/admin/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/page-header";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mes?: string; periodo?: string }> }) {
  await requirePagePermission("finance.view");
  const sp = await searchParams;
  const monthsBack = sp.periodo === "3m" ? 3 : sp.periodo === "12m" ? 12 : sp.periodo === "1m" ? 1 : 6;
  const endMonth = monthPeriod(parseMonthKey(sp.mes));
  const start = new Date(endMonth.start.getFullYear(), endMonth.start.getMonth() - (monthsBack - 1), 1);
  const end = endMonth.end;
  const months = lastMonths(monthsBack, endMonth.start);

  const paidWhere = and(eq(orders.paymentStatus, "approved"), gte(orders.paidAt, start), lt(orders.paidAt, end));
  const [paid, items, inv, jobs, waste, newCustomers, quoteStats, ticketStats] = await Promise.all([
    db.query.orders.findMany({ where: paidWhere, with: { customer: true } }),
    db
      .select({ name: orderItems.name, productId: orderItems.productId, quoteId: orderItems.quoteId, qty: sql<number>`sum(${orderItems.quantity})`, revenue: sql<number>`sum(${orderItems.totalCents})`, cost: sql<number>`sum(coalesce(${orderItems.unitCostCents},0) * ${orderItems.quantity})` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(paidWhere)
      .groupBy(orderItems.name, orderItems.productId, orderItems.quoteId)
      .orderBy(desc(sql`sum(${orderItems.totalCents})`))
      .limit(15),
    inventoryValuation(),
    db.query.printJobs.findMany({ where: and(inArray(printJobs.status, ["done", "failed"]), gte(printJobs.finishedAt, start), lt(printJobs.finishedAt, end)), with: { printer: true, material: true, product: true } }),
    db.query.stockMovements.findMany({ where: and(eq(stockMovements.reason, "waste"), gte(stockMovements.createdAt, start), lt(stockMovements.createdAt, end)), with: { material: true } }),
    db.select({ n: sql<number>`count(*)` }).from(customers).where(and(gte(customers.createdAt, start), lt(customers.createdAt, end))),
    db.select({ status: quotes.status, n: sql<number>`count(*)`, value: sql<number>`coalesce(sum(${quotes.priceCents}),0)` }).from(quotes).where(and(gte(quotes.createdAt, start), lt(quotes.createdAt, end))).groupBy(quotes.status),
    db.select({ status: tickets.status, n: sql<number>`count(*)` }).from(tickets).where(and(gte(tickets.createdAt, start), lt(tickets.createdAt, end))).groupBy(tickets.status),
  ]);

  // vendas
  const revenue = paid.reduce((a, o) => a + o.totalCents, 0);
  const ticket = paid.length ? Math.round(revenue / paid.length) : 0;
  const byMethod = new Map<string, number>();
  const byShipping = new Map<string, number>();
  for (const o of paid) {
    byMethod.set(o.paymentMethod, (byMethod.get(o.paymentMethod) ?? 0) + o.totalCents);
    byShipping.set(o.shippingMethod, (byShipping.get(o.shippingMethod) ?? 0) + 1);
  }
  const repeat = (() => {
    const counts = new Map<string, number>();
    for (const o of paid) counts.set(o.customerEmail, (counts.get(o.customerEmail) ?? 0) + 1);
    const total = counts.size;
    const rep = [...counts.values()].filter((n) => n > 1).length;
    return { total, rep, pct: total ? (rep / total) * 100 : 0 };
  })();
  const monthly = months.map((m) => paid.filter((o) => o.paidAt! >= m.start && o.paidAt! < m.end));
  const topCustomers = (() => {
    const map = new Map<string, { label: string; value: number; n: number }>();
    for (const o of paid) {
      const cur = map.get(o.customerEmail) ?? { label: o.customerName, value: 0, n: 0 };
      cur.value += o.totalCents;
      cur.n += 1;
      map.set(o.customerEmail, cur);
    }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8).map((c) => ({ label: c.label, value: c.value, hint: `${c.n} pedido(s)` }));
  })();

  // produção
  const produced = jobs.reduce((a, j) => a + (j.producedQty ?? 0), 0);
  const failed = jobs.reduce((a, j) => a + (j.failedQty ?? 0), 0);
  const minutes = jobs.reduce((a, j) => a + (j.actualMinutes ?? j.estimatedMinutes), 0);
  const wasteGrams = waste.reduce((a, m) => a + Math.abs(m.deltaGrams), 0);
  const wasteCents = waste.reduce((a, m) => a + Math.round((Math.abs(m.deltaGrams) / 1000) * m.material.costPerKgCents), 0);
  const byPrinter = new Map<string, { minutes: number; jobs: number; failed: number }>();
  for (const j of jobs) {
    const k = j.printer?.name ?? "sem máquina";
    const cur = byPrinter.get(k) ?? { minutes: 0, jobs: 0, failed: 0 };
    cur.minutes += j.actualMinutes ?? j.estimatedMinutes;
    cur.jobs += 1;
    cur.failed += j.failedQty ?? 0;
    byPrinter.set(k, cur);
  }
  const hoursAvailable = monthsBack * 30 * 20; // 20 h/dia por máquina como referência
  const failByProduct = (() => {
    const map = new Map<string, { good: number; bad: number }>();
    for (const j of jobs) {
      const k = j.product?.name ?? j.title;
      const cur = map.get(k) ?? { good: 0, bad: 0 };
      cur.good += j.producedQty ?? 0;
      cur.bad += j.failedQty ?? 0;
      map.set(k, cur);
    }
    return [...map.entries()].filter(([, v]) => v.bad > 0).map(([label, v]) => ({ label, value: Math.round((v.bad / Math.max(1, v.good + v.bad)) * 100), hint: `${v.bad} perdidas de ${v.good + v.bad}` })).sort((a, b) => b.value - a.value).slice(0, 8);
  })();

  // estoque
  const mats = await db.query.materials.findMany({ where: eq(materials.active, true) });
  const consumption = await db.select({ materialId: stockMovements.materialId, grams: sql<number>`sum(-${stockMovements.deltaGrams})` }).from(stockMovements).where(and(inArray(stockMovements.reason, ["print", "waste"]), gte(stockMovements.createdAt, start), lt(stockMovements.createdAt, end))).groupBy(stockMovements.materialId);
  const coverage = mats.map((m) => {
    const used = consumption.find((c) => c.materialId === m.id)?.grams ?? 0;
    const perDay = used / (monthsBack * 30);
    return { m, used, days: perDay > 0 ? Math.round(m.stockGrams / perDay) : null };
  }).sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

  const qs = (patch: Record<string, string>) => `/admin/relatorios?${new URLSearchParams({ mes: endMonth.key, periodo: sp.periodo ?? "6m", ...patch })}`;
  const periodLabel = `${months[0].label} – ${endMonth.label}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description={`Vendas, produção, estoque e clientes · ${periodLabel}`}
        actions={
          <form className="flex flex-wrap items-center gap-2 text-sm">
            {(["1m", "3m", "6m", "12m"] as const).map((p) => (
              <Link key={p} href={qs({ periodo: p })} className={cn("rounded-full border px-3 py-1", (sp.periodo ?? "6m") === p && "bg-foreground text-blush")}>{p}</Link>
            ))}
            <input type="hidden" name="periodo" value={sp.periodo ?? "6m"} />
            <input type="month" name="mes" defaultValue={endMonth.key} className="h-9 rounded-lg border bg-card px-2" />
            <Button type="submit" variant="outline" size="sm">Até este mês</Button>
          </form>
        }
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Vendas</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Receita paga" value={formatBRL(revenue)} hint={`${paid.length} pedidos`} />
          <Stat label="Ticket médio" value={formatBRL(ticket)} />
          <Stat label="Recompra" value={`${repeat.pct.toFixed(0)}%`} hint={`${repeat.rep} de ${repeat.total} clientes compraram 2+`} />
          <Stat label="Novos clientes" value={newCustomers[0]?.n ?? 0} />
          <Stat label="Conversão de orçamentos" value={(() => { const t = quoteStats.reduce((a, q) => a + q.n, 0); const ok = quoteStats.filter((q) => q.status === "approved").reduce((a, q) => a + q.n, 0); return t ? `${Math.round((ok / t) * 100)}%` : "—"; })()} hint={`${quoteStats.reduce((a, q) => a + q.n, 0)} solicitados`} />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader><CardTitle>Pedidos pagos e receita por mês</CardTitle></CardHeader>
            <CardContent>
              <GroupedBars labels={months.map((m) => m.label)} series={[{ name: "Receita bruta", values: monthly.map((os) => os.reduce((a, o) => a + o.totalCents, 0)) }]} />
              <p className="mt-1 text-xs text-muted-foreground">Pedidos por mês: {monthly.map((os, i) => `${months[i].label} ${os.length}`).join(" · ")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Por pagamento e entrega</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <HBars rows={[...byMethod.entries()].map(([k, v]) => ({ label: k, value: v }))} color={SERIES[0]} />
              <HBars rows={[...byShipping.entries()].map(([k, v]) => ({ label: k, value: v }))} money={false} color={SERIES[3]} />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Top produtos (receita, margem por item)</CardTitle></CardHeader>
            <CardContent>
              <HBars rows={items.map((i) => ({ label: i.quoteId ? `Personalizado · ${i.name.replace(/^Personalizado: /, "")}` : i.name, value: i.revenue, hint: `${i.qty} un. · margem ${i.revenue ? Math.round(((i.revenue - i.cost) / i.revenue) * 100) : 0}%` }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top clientes</CardTitle></CardHeader>
            <CardContent><HBars rows={topCustomers} color={SERIES[2]} /></CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Produção</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Peças boas" value={produced} hint={`${jobs.length} fornadas/jobs`} />
          <Stat label="Taxa de perda" value={`${produced + failed ? Math.round((failed / (produced + failed)) * 100) : 0}%`} hint={`${failed} perdidas`} tone={failed > 0 ? "warning" : undefined} />
          <Stat label="Horas de máquina" value={`${Math.round(minutes / 60)} h`} />
          <Stat label="Desperdício" value={`${wasteGrams} g`} hint={formatBRL(wasteCents)} tone={wasteCents > 0 ? "warning" : undefined} />
          <Stat label="Custo médio por peça boa" value={produced ? formatBRL(Math.round(wasteCents / produced)) : "—"} hint="só desperdício rateado" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Ocupação por máquina</CardTitle><p className="text-sm text-muted-foreground">referência: 20 h/dia disponíveis</p></CardHeader>
            <CardContent>
              <HBars rows={[...byPrinter.entries()].map(([k, v]) => ({ label: k, value: Math.round((v.minutes / 60 / hoursAvailable) * 100), hint: `${Math.round(v.minutes / 60)} h · ${v.jobs} jobs · ${v.failed} perdidas` }))} money={false} color={SERIES[1]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Taxa de falha por produto (%)</CardTitle></CardHeader>
            <CardContent><HBars rows={failByProduct} money={false} color="#d03b3b" /></CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Estoque</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Valor total (ao custo)" value={formatBRL(inv.totalCents)} />
          <Stat label="Produtos prontos" value={`${inv.productUnits} un.`} hint={formatBRL(inv.productCents)} />
          <Stat label="Filamento" value={`${(inv.materialGrams / 1000).toFixed(1)} kg`} hint={formatBRL(inv.materialCents)} />
          <Stat label="Em baixa" value={inv.lowMaterials.length + inv.lowSupplies.length} tone={inv.lowMaterials.length + inv.lowSupplies.length ? "danger" : undefined} hint={[...inv.lowMaterials.map((m) => m.name), ...inv.lowSupplies.map((s) => s.name)].join(", ")} />
        </div>
        <Card>
          <CardHeader><CardTitle>Cobertura de filamento</CardTitle><p className="text-sm text-muted-foreground">dias de estoque no ritmo de consumo do período (impressão + desperdício)</p></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {coverage.map(({ m, used, days }) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1">{m.name}</span>
                  <span className="text-muted-foreground">{m.stockGrams} g · consumo {used} g</span>
                  <span className={cn("w-28 text-right font-medium", days != null && days < 30 && "text-danger")}>{days == null ? "sem consumo" : `${days} dias`}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Atendimento</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {["open", "pending", "resolved", "closed"].map((st) => <Stat key={st} label={`Chamados ${st}`} value={ticketStats.find((t) => t.status === st)?.n ?? 0} />)}
        </div>
      </section>
    </div>
  );
}
