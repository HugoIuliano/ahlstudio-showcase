import Link from "next/link";
import { Trash2 } from "lucide-react";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { assets, expenses, manualRevenues } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth";
import { computePnL, inventoryValuation, lastMonths, monthPeriod, parseMonthKey } from "@/lib/finance";
import { assetCategoryLabels, expenseCategoryLabels, revenueLineLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { cn, formatDate } from "@/lib/utils";
import { deleteExpenseAction, deleteManualRevenueAction, disposeAssetAction } from "@/actions/finance";
import { GroupedBars, WaterfallRows } from "@/components/admin/charts";
import { AssetForm, ExpenseForm, ManualRevenueForm } from "@/components/admin/finance-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/page-header";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePagePermission("finance.view");
  const { mes } = await searchParams;
  const s = await getSettings();
  const current = monthPeriod(parseMonthKey(mes));
  const months = lastMonths(12, current.start);

  const [pnl, series, inv, prs, expenseList, assetList, revenueList] = await Promise.all([
    computePnL(current, s),
    Promise.all(months.map((m) => computePnL(m, s))),
    inventoryValuation(),
    db.query.printers.findMany(),
    db.query.expenses.findMany({ orderBy: desc(expenses.date), limit: 60 }),
    db.query.assets.findMany({ orderBy: desc(assets.purchaseDate), with: { printer: true } }),
    db.query.manualRevenues.findMany({ orderBy: desc(manualRevenues.date), limit: 20 }),
  ]);
  const prev = series[series.length - 2];
  const delta = (a: number, b?: number) => (b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
  const trend = (v: number | null) => (v == null ? undefined : `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(0)}% vs. mês anterior`);
  const monthLabel = current.start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const recurring = expenseList.filter((e) => e.recurring && (!e.endDate || e.endDate >= new Date()));
  const monthlyBurn = recurring.reduce((a, e) => a + e.amountCents, 0);
  const capexTotal = assetList.filter((a) => !a.disposedAt).reduce((a, x) => a + x.amountCents, 0);

  const dre = [
    { label: "Receita bruta", value: pnl.revenue.grossCents, kind: "plus" as const },
    { label: `Taxas de pagamento (~${s.fee_card_pct}% cartão)`, value: pnl.deductions.feesCents, kind: "minus" as const },
    { label: `Impostos (${s.tax_pct}%)`, value: pnl.deductions.taxesCents, kind: "minus" as const },
    { label: "Receita líquida", value: pnl.deductions.netCents, kind: "total" as const },
    { label: "COGS — custo dos produtos vendidos", value: pnl.cogs.productsCents, kind: "minus" as const },
    { label: "COGS — desperdício de filamento", value: pnl.cogs.wasteCents, kind: "minus" as const },
    { label: "COGS — frete pago (etiquetas SuperFrete / entrega local)", value: pnl.cogs.shippingCents, kind: "minus" as const },
    { label: "COGS — compras de material/insumo/energia/frete", value: pnl.cogs.expensesCents + pnl.cogs.manualCents, kind: "minus" as const },
    { label: `Margem bruta (${pnl.grossMarginPct.toFixed(0)}%)`, value: pnl.grossMarginCents, kind: "total" as const },
    ...Object.entries(pnl.opex.byCategory).map(([k, v]) => ({ label: `OPEX — ${expenseCategoryLabels[k as keyof typeof expenseCategoryLabels]}`, value: v ?? 0, kind: "minus" as const })),
    { label: `EBITDA (${pnl.ebitdaPct.toFixed(0)}%)`, value: pnl.ebitdaCents, kind: "total" as const },
    { label: "Depreciação (CAPEX)", value: pnl.depreciationCents, kind: "minus" as const },
    { label: "Resultado do mês", value: pnl.resultCents, kind: "total" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description={`DRE de ${monthLabel}. Receita reconhecida pela data do pagamento; custo dos produtos é o snapshot de cada pedido.`}
        actions={
          <form className="flex items-center gap-2 text-sm">
            <input type="month" name="mes" defaultValue={current.key} className="h-9 rounded-lg border bg-card px-2" />
            <Button type="submit" variant="outline" size="sm">Ver mês</Button>
            <Link href="/admin/forecast" className="inline-flex h-8 items-center rounded-lg bg-canary px-3 text-xs font-semibold text-accent-foreground">Forecast →</Link>
            <Link href="/admin/relatorios" className="inline-flex h-8 items-center rounded-lg border bg-card px-3 text-xs font-medium hover:bg-muted">Relatórios →</Link>
          </form>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Receita bruta" value={formatBRL(pnl.revenue.grossCents)} hint={trend(delta(pnl.revenue.grossCents, prev?.revenue.grossCents)) ?? `${pnl.revenue.ordersCount} pedidos pagos`} />
        <Stat label="Margem bruta" value={`${pnl.grossMarginPct.toFixed(0)}%`} hint={formatBRL(pnl.grossMarginCents)} tone={pnl.grossMarginPct < 40 ? "warning" : undefined} />
        <Stat label="EBITDA" value={formatBRL(pnl.ebitdaCents)} hint={`${pnl.ebitdaPct.toFixed(0)}% da receita líquida`} tone={pnl.ebitdaCents < 0 ? "danger" : undefined} />
        <Stat label="Resultado (após depreciação)" value={formatBRL(pnl.resultCents)} tone={pnl.resultCents < 0 ? "danger" : undefined} />
        <Stat label="OPEX recorrente / mês" value={formatBRL(monthlyBurn)} hint={`${recurring.length} lançamentos ativos`} />
        <Stat label="Estoque (ao custo)" value={formatBRL(inv.totalCents)} hint={`produtos ${formatBRL(inv.productCents)} · filamento ${formatBRL(inv.materialCents)} · insumos ${formatBRL(inv.supplyCents)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader><CardTitle>Receita, custos e EBITDA — últimos 12 meses</CardTitle></CardHeader>
          <CardContent>
            <GroupedBars
              labels={series.map((p) => p.period.label)}
              series={[
                { name: "Receita líquida", values: series.map((p) => p.deductions.netCents) },
                { name: "COGS + OPEX", values: series.map((p) => p.cogs.totalCents + p.opex.totalCents) },
                { name: "EBITDA", values: series.map((p) => p.ebitdaCents) },
              ]}
            />
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Ver tabela</summary>
              <div className="scroll-x mt-2">
                <table className="w-full">
                  <thead><tr className="text-left"><th>Mês</th><th className="text-right">Receita líq.</th><th className="text-right">COGS</th><th className="text-right">OPEX</th><th className="text-right">EBITDA</th><th className="text-right">Margem</th></tr></thead>
                  <tbody>
                    {series.map((p) => (
                      <tr key={p.period.key} className={cn("border-t", p.period.key === current.key && "font-semibold text-foreground")}>
                        <td className="py-1"><Link href={`/admin/financeiro?mes=${p.period.key}`} className="hover:underline">{p.period.label}</Link></td>
                        <td className="text-right">{formatBRL(p.deductions.netCents)}</td>
                        <td className="text-right">{formatBRL(p.cogs.totalCents)}</td>
                        <td className="text-right">{formatBRL(p.opex.totalCents)}</td>
                        <td className={cn("text-right", p.ebitdaCents < 0 && "text-danger")}>{formatBRL(p.ebitdaCents)}</td>
                        <td className="text-right">{p.grossMarginPct.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Linhas de receita — {current.label}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(Object.entries(pnl.revenue.byLine) as [keyof typeof revenueLineLabels, number][]).filter(([, v]) => v > 0).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3">
                  <span>{revenueLineLabels[k]}</span>
                  <span className="font-medium">{formatBRL(v)} <span className="text-xs text-muted-foreground">({pnl.revenue.grossCents ? ((v / pnl.revenue.grossCents) * 100).toFixed(0) : 0}%)</span></span>
                </li>
              ))}
              {pnl.revenue.shippingCents > 0 && <li className="flex justify-between text-muted-foreground"><span>Frete cobrado</span><span>{formatBRL(pnl.revenue.shippingCents)}</span></li>}
              {pnl.revenue.grossCents === 0 && <li className="text-muted-foreground">Sem receita no mês.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>DRE — {monthLabel}</CardTitle></CardHeader>
        <CardContent><WaterfallRows rows={dre} /></CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lançar despesa (OPEX / COGS)</CardTitle>
            <p className="text-sm text-muted-foreground">Cloud, infra, software, aluguel, energia, pró-labore… Marque "recorrente" para contabilizar todo mês automaticamente.</p>
          </CardHeader>
          <CardContent><ExpenseForm /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>CAPEX — ativos e depreciação</CardTitle>
            <p className="text-sm text-muted-foreground">Máquinas, computadores e ferramentas. A depreciação linear entra abaixo do EBITDA. Total imobilizado: <strong>{formatBRL(capexTotal)}</strong>.</p>
          </CardHeader>
          <CardContent><AssetForm printers={prs} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Lançamentos recentes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {expenseList.length === 0 && <li className="p-5 text-muted-foreground">Nenhuma despesa lançada.</li>}
              {expenseList.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2">
                  <span className="w-20 text-xs text-muted-foreground">{formatDate(e.date)}</span>
                  <Badge tone={e.kind === "cogs" ? "info" : "neutral"}>{e.kind.toUpperCase()}</Badge>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{expenseCategoryLabels[e.category]}</span>
                  <span className="min-w-0 flex-1 truncate">{e.description}{e.recurring && <span className="ml-1 text-xs text-muted-foreground">· mensal{e.endDate ? ` até ${formatDate(e.endDate)}` : ""}</span>}</span>
                  <span className="font-medium text-danger">−{formatBRL(e.amountCents)}</span>
                  <form action={deleteExpenseAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <Button type="submit" variant="ghost" size="icon" aria-label="Excluir"><Trash2 className="text-muted-foreground" /></Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Ativos (CAPEX)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y text-sm">
                {assetList.length === 0 && <li className="p-5 text-muted-foreground">Nenhum ativo registrado.</li>}
                {assetList.map((a) => {
                  const monthly = Math.round((a.amountCents - a.salvageCents) / a.usefulLifeMonths);
                  const monthsElapsed = Math.max(0, (new Date().getFullYear() - a.purchaseDate.getFullYear()) * 12 + new Date().getMonth() - a.purchaseDate.getMonth());
                  const book = Math.max(a.salvageCents, a.amountCents - monthly * Math.min(monthsElapsed, a.usefulLifeMonths));
                  return (
                    <li key={a.id} className={cn("flex items-center gap-3 px-5 py-2", a.disposedAt && "opacity-50")}>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.name}</span><span className="text-xs text-muted-foreground">{assetCategoryLabels[a.category]} · {formatDate(a.purchaseDate)} · {a.usefulLifeMonths} m{a.printer ? ` · ${a.printer.name}` : ""}</span></span>
                      <span className="text-right text-xs"><span className="block font-medium">{formatBRL(a.amountCents)}</span><span className="text-muted-foreground">{formatBRL(monthly)}/mês · contábil {formatBRL(book)}</span></span>
                      {!a.disposedAt && (
                        <form action={disposeAssetAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button type="submit" variant="ghost" size="sm" title="Dar baixa">Baixar</Button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Receitas fora do e-commerce</CardTitle><p className="text-sm text-muted-foreground">Feira, serviço de modelagem, venda direta.</p></CardHeader>
            <CardContent className="space-y-4">
              <ManualRevenueForm />
              {revenueList.length > 0 && (
                <ul className="divide-y text-sm">
                  {revenueList.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2">
                      <span className="w-20 text-xs text-muted-foreground">{formatDate(r.date)}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{revenueLineLabels[r.line]}</span>
                      <span className="min-w-0 flex-1 truncate">{r.description}</span>
                      <span className="font-medium text-emerald-700">+{formatBRL(r.amountCents)}</span>
                      <form action={deleteManualRevenueAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" variant="ghost" size="icon" aria-label="Excluir"><Trash2 className="text-muted-foreground" /></Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
