import Link from "next/link";
import { db } from "@/db";
import { requirePagePermission } from "@/lib/auth";
import { forecast, lastMonths, computePnL } from "@/lib/finance";
import { formatBRL } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { GroupedBars } from "@/components/admin/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/page-header";

export default async function ForecastPage() {
  await requirePagePermission("finance.view");
  const s = await getSettings();
  const [f, history] = await Promise.all([forecast(s), Promise.all(lastMonths(6).map((m) => computePnL(m, s)))]);
  void db;
  const labels = [...history.map((p) => p.period.label.replace(".", "")), "proj."];
  const revenue = [...history.slice(0, -1).map((p) => p.revenue.grossCents), f.mtd, f.projectedMonthCents];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecast"
        description="Pipeline do e-commerce (pedidos aguardando pagamento e orçamentos em aberto), projeção do mês pelo ritmo de vendas e necessidade de material da fila."
        actions={<Link href="/admin/financeiro" className="inline-flex h-8 items-center rounded-lg border bg-card px-3 text-xs font-medium hover:bg-muted">← Financeiro</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Realizado no mês" value={formatBRL(f.mtd)} hint={`ritmo: ${formatBRL(f.dailyRunRate)}/dia (média 90 d)`} />
        <Stat label="Projeção de fechamento" value={formatBRL(f.projectedMonthCents)} hint={`${f.daysLeft} dia(s) restantes + pedidos pendentes ponderados`} />
        <Stat label="Pipeline ponderado" value={formatBRL(f.weightedCents)} hint={`pendentes ×${f.pPending} · orçados ×${f.pQuoted}`} />
        <Stat label="Aguardando pagamento" value={formatBRL(f.pendingCents)} hint={`${f.pendingOrders.length} pedido(s)`} tone={f.pendingOrders.length ? "warning" : undefined} />
        <Stat label="Caixa estimado 30 d" value={formatBRL(f.cash30)} hint={`entradas − ${formatBRL(f.recurringCents)} de OPEX recorrente`} tone={f.cash30 < 0 ? "danger" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader><CardTitle>Receita bruta — 5 meses fechados, mês atual e projeção</CardTitle></CardHeader>
          <CardContent>
            <GroupedBars labels={labels} series={[{ name: "Receita bruta", values: revenue }]} />
            <p className="mt-2 text-xs text-muted-foreground">A projeção soma o realizado até hoje, o ritmo diário dos últimos 90 dias pelos dias restantes e {Math.round(f.pPending * 100)}% dos pedidos aguardando pagamento. Ajuste as probabilidades em Configurações.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Material necessário para a fila</CardTitle><p className="text-sm text-muted-foreground">{f.queueMinutes ? `${Math.round(f.queueMinutes / 60)} h de produção enfileiradas` : "Fila vazia"}</p></CardHeader>
          <CardContent>
            {f.materialNeeds.length === 0 ? <p className="text-sm text-muted-foreground">Nada enfileirado.</p> : (
              <ul className="space-y-2 text-sm">
                {f.materialNeeds.map((m) => (
                  <li key={m.name} className="flex items-center justify-between gap-2">
                    <span>{m.name}</span>
                    <span className={m.shortfallGrams > 0 ? "font-medium text-danger" : "text-muted-foreground"}>
                      {m.grams} g de {m.stockGrams} g{m.shortfallGrams > 0 ? ` · comprar ${m.shortfallGrams} g (~${formatBRL(Math.round((m.shortfallGrams / 1000) * m.costPerKgCents))})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Pedidos aguardando pagamento</CardTitle><p className="text-sm text-muted-foreground">{formatBRL(f.pendingCents)} · probabilidade {Math.round(f.pPending * 100)}%</p></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {f.pendingOrders.length === 0 && <li className="p-5 text-muted-foreground">Nenhum.</li>}
              {f.pendingOrders.slice(0, 15).map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-5 py-2">
                  <Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">{o.number}</Link>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.customerName} · {formatDate(o.createdAt)}</span>
                  <span>{formatBRL(o.totalCents)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Orçamentos enviados (aguardando cliente)</CardTitle><p className="text-sm text-muted-foreground">{formatBRL(f.quotedCents)} · probabilidade {Math.round(f.pQuoted * 100)}%</p></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {f.quoted.length === 0 && <li className="p-5 text-muted-foreground">Nenhum.</li>}
              {f.quoted.slice(0, 15).map((q) => (
                <li key={q.id} className="flex items-center gap-3 px-5 py-2">
                  <Link href={`/admin/orcamentos/${q.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{q.title}</Link>
                  <span className="text-xs text-muted-foreground">{q.customer?.name}{q.validUntil ? ` · até ${formatDate(q.validUntil)}` : ""}</span>
                  <span>{formatBRL(q.priceCents)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Em análise / a precificar</CardTitle><p className="text-sm text-muted-foreground">{f.reviewing.length} orçamento(s) ainda sem preço — pipeline futuro</p></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {f.reviewing.length === 0 && <li className="p-5 text-muted-foreground">Nenhum.</li>}
              {f.reviewing.slice(0, 15).map((q) => (
                <li key={q.id} className="flex items-center gap-3 px-5 py-2">
                  <Link href={`/admin/orcamentos/${q.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{q.title}</Link>
                  <span className="text-xs text-muted-foreground">{q.quantity} un. · {formatDate(q.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
