import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Clock, Factory, Lightbulb, MessageSquareText, Play, Trash2, XCircle } from "lucide-react";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { materials, printers, printJobs, quotes } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth";
import { printJobStatusLabels, quoteStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { backlogDays, capacityFrom, getBacklog, quotesToAnswer, scheduleQueue, suggestStockJobs } from "@/lib/production-queue";
import { getSettings } from "@/lib/settings";
import { cn, formatDate } from "@/lib/utils";
import { bumpPrintJobAction, createStockBatchAction, deletePrintJobAction, setPrintJobDueAction, setPrintJobStatusAction } from "@/actions/erp";
import { PrintJobForm } from "@/components/admin/simple-forms";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, Stat } from "@/components/ui/page-header";

const sourceLabel = { order: { label: "Pedido", cls: "bg-powder" }, quote: { label: "Personalizado", cls: "bg-canary text-accent-foreground" }, stock: { label: "Estoque", cls: "bg-custard" }, manual: { label: "Manual", cls: "bg-muted" } } as const;
const toInputDate = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "");

export default async function ProductionPage() {
  await requirePagePermission("production.view");
  const s = await getSettings();
  const cap = capacityFrom(s);
  const [active, done, prs, mats, openQuotes, backlog, toAnswer, suggestions] = await Promise.all([
    db.query.printJobs.findMany({ where: inArray(printJobs.status, ["queued", "printing"]), with: { printer: true, material: true, order: true, product: true, variant: true } }),
    db.query.printJobs.findMany({ where: inArray(printJobs.status, ["done", "failed", "cancelled"]), orderBy: desc(printJobs.updatedAt), limit: 12, with: { printer: true } }),
    db.query.printers.findMany({ orderBy: asc(printers.name) }),
    db.query.materials.findMany({ where: eq(materials.active, true), orderBy: asc(materials.name) }),
    db.query.quotes.findMany({ where: inArray(quotes.status, ["approved", "quoted"]), columns: { id: true, number: true, title: true } }),
    getBacklog(),
    quotesToAnswer(Number(s.production_quote_sla_days) || 2),
    suggestStockJobs(s),
  ]);

  const scheduled = scheduleQueue(active, cap);
  const printing = scheduled.filter((j) => j.status === "printing");
  const queued = scheduled.filter((j) => j.status === "queued");
  const late = scheduled.filter((j) => j.late);
  const days = backlogDays(backlog, cap);
  const idle = active.length === 0;
  const lastFinish = scheduled.at(-1)?.projectedFinish;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fila de produção"
        description="Pedidos pagos entram sozinhos (itens sem estoque e personalizados). A fila é ordenada pelo prazo alvo; o tamanho dela já puxa o prazo prometido nas novas vendas."
        actions={<Link href="/admin/frete" className="inline-flex h-9 items-center rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted">Capacidade e prazos</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Imprimindo agora" value={printing.length} hint={printing.map((j) => j.printer?.name).filter(Boolean).join(", ") || `${prs.filter((p) => p.status === "idle").length} máquina(s) livre(s)`} />
        <Stat label="Na fila" value={queued.length} hint={`${Math.round(backlog.printMinutes / 60)} h de máquina · ${Math.round(backlog.laborMinutes / 60)} h de acabamento`} />
        <Stat label="Fila em dias úteis" value={days} tone={days > 5 ? "warning" : undefined} hint={lastFinish ? `tudo pronto até ${formatDate(lastFinish)} · novas vendas sob encomenda recebem +${days} dia(s)` : "sem fila: prazo só de produção + embalagem"} />
        <Stat label="Em risco de atraso" value={late.length} tone={late.length ? "danger" : undefined} hint={late.length ? "previsão passa do prazo alvo" : "todos dentro do prazo"} />
        <Stat label="Orçamentos a responder" value={toAnswer.length} tone={toAnswer.some((q) => q.overdue) ? "danger" : toAnswer.length ? "warning" : undefined} hint={`SLA ${s.production_quote_sla_days} dia(s) útil(eis)`} />
      </div>

      {toAnswer.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquareText className="size-4" /> Orçamentos aguardando sua resposta</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {toAnswer.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/orcamentos/${q.id}`} className="font-medium hover:underline">{q.number} · {q.title}</Link>
                    <p className="text-xs text-muted-foreground">{q.customer?.name ?? "cliente"} · {q.quantity} un. · pedido em {formatDate(q.createdAt)}{q.deadline ? ` · cliente quer para ${q.deadline}` : ""}</p>
                  </div>
                  <StatusBadge value={q.status} map={quoteStatusLabels} />
                  <span className={cn("text-xs", q.overdue ? "font-semibold text-danger" : "text-muted-foreground")}>{q.overdue ? "SLA estourado" : `responder até ${formatDate(q.dueAt)}`}</span>
                  <Link href={`/admin/orcamentos/${q.id}`} className="inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-xs font-semibold text-blush">Orçar</Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Factory className="size-4" /> Fila ({active.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Ordem: imprimindo → prazo alvo mais cedo → prioridade. Previsão calculada com {cap.hoursPerDay} h × {cap.machines} máquina(s)/dia e {cap.laborHoursPerDay} h/dia de acabamento.</p>
        </CardHeader>
        <CardContent className="p-0">
          {active.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Fila vazia — máquinas ociosas. Aproveite as sugestões abaixo para reforçar o estoque.</p>
          ) : (
            <ul className="divide-y">
              {scheduled.map((j, idx) => {
                const src = sourceLabel[j.source];
                return (
                  <li key={j.id} className={cn("px-5 py-3 text-sm", j.late && "bg-red-50/60")}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-6 text-center text-xs text-muted-foreground">{idx + 1}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", src.cls)}>{src.label}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{j.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {j.quantity} un. · ~{j.estimatedMinutes} min impressão{j.laborMinutes ? ` + ${j.laborMinutes} min acabamento` : ""} · ~{j.estimatedGrams} g · {j.material?.name ?? "sem material"} · {j.printer?.name ?? "sem máquina"}
                          {j.order && <> · <Link href={`/admin/pedidos/${j.order.id}`} className="hover:underline">{j.order.number}</Link></>}
                          {j.priority !== 0 && <span className="ml-1 rounded bg-canary px-1 text-accent-foreground">prioridade {j.priority > 0 ? "+" : ""}{j.priority}</span>}
                        </p>
                        {j.notes && <p className="mt-0.5 text-xs">{j.notes}</p>}
                      </div>
                      <div className="text-right text-xs">
                        <p className={cn("flex items-center justify-end gap-1", j.late ? "font-semibold text-danger" : "text-muted-foreground")}>{j.late && <AlertTriangle className="size-3.5" />}<Clock className="size-3.5" /> previsão {formatDate(j.projectedFinish)}</p>
                        <form action={setPrintJobDueAction} className="mt-1 flex items-center justify-end gap-1">
                          <input type="hidden" name="id" value={j.id} />
                          <span className="text-muted-foreground">prazo</span>
                          <Input name="dueAt" type="date" defaultValue={toInputDate(j.dueAt)} className="h-7 w-36 px-1.5 text-xs" />
                          <Button type="submit" variant="ghost" size="sm" className="h-7 px-2 text-xs">ok</Button>
                        </form>
                      </div>
                      <StatusBadge value={j.status} map={printJobStatusLabels} />
                      <div className="flex items-center gap-1">
                        <form action={bumpPrintJobAction}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="delta" value="1" /><Button type="submit" variant="ghost" size="icon" aria-label="Subir prioridade"><ArrowUp /></Button></form>
                        <form action={bumpPrintJobAction}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="delta" value="-1" /><Button type="submit" variant="ghost" size="icon" aria-label="Descer prioridade"><ArrowDown /></Button></form>
                        {j.status === "queued" && (
                          <form action={setPrintJobStatusAction}>
                            <input type="hidden" name="id" value={j.id} />
                            <input type="hidden" name="status" value="printing" />
                            <Button type="submit" size="sm"><Play /> Iniciar</Button>
                          </form>
                        )}
                        <form action={deletePrintJobAction}><input type="hidden" name="id" value={j.id} /><Button type="submit" variant="ghost" size="icon" aria-label="Excluir"><Trash2 className="text-muted-foreground" /></Button></form>
                      </div>
                    </div>
                    {j.status === "printing" && (
                      <form action={setPrintJobStatusAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-muted/60 p-2">
                        <input type="hidden" name="id" value={j.id} />
                        <label className="text-xs"><span className="block text-muted-foreground">Boas</span><Input name="producedQty" type="number" min={0} defaultValue={j.quantity} className="h-8 w-16 px-2 text-xs" /></label>
                        <label className="text-xs"><span className="block text-muted-foreground">Perdidas</span><Input name="failedQty" type="number" min={0} defaultValue={0} className="h-8 w-16 px-2 text-xs" /></label>
                        <label className="text-xs"><span className="block text-muted-foreground">Desperdício (g)</span><Input name="wasteGrams" type="number" min={0} defaultValue={0} className="h-8 w-20 px-2 text-xs" /></label>
                        <label className="text-xs"><span className="block text-muted-foreground">Minutos</span><Input name="actualMinutes" type="number" min={0} placeholder={`${j.estimatedMinutes}`} className="h-8 w-20 px-2 text-xs" /></label>
                        <Button type="submit" size="sm" name="status" value="done" className="bg-emerald-600 text-white hover:bg-emerald-700"><CheckCircle2 /> Concluir</Button>
                        <Button type="submit" size="sm" variant="outline" name="status" value="failed" title="Marca tudo como perdido (ajuste os campos acima se sobrou algo)"><XCircle /> Fornada perdida</Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className={cn(idle && "border-canary")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4" /> Sugestões para um estoque saudável {idle && <span className="rounded bg-canary px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">máquinas ociosas</span>}</CardTitle>
          <p className="text-sm text-muted-foreground">Produtos abaixo do estoque saudável (definido no produto ou {s.production_stock_cover_days} dias de venda). Já desconta o que está na fila e checa o filamento.</p>
        </CardHeader>
        <CardContent className="p-0">
          {suggestions.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Estoque saudável em tudo — nada a sugerir agora.</p>
          ) : (
            <ul className="divide-y text-sm">
              {suggestions.map((sg) => (
                <li key={`${sg.product.id}-${sg.variant?.id ?? "base"}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/produtos/${sg.product.id}`} className="font-medium hover:underline">{sg.product.name}{sg.variant ? ` · ${sg.variant.value}` : ""}</Link>
                    <p className="text-xs text-muted-foreground">
                      estoque {sg.stock} → alvo {sg.target}{sg.queued ? ` (${sg.queued} já na fila)` : ""} · {sg.reason} · {sg.soldLast60} vendida(s) em 60 dias · margem {formatBRL(sg.product.priceCents - sg.product.costCents)}/un.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      fornada de {sg.shortfall}: ~{Math.round(sg.printMinutes / 60)} h · {sg.gramsNeeded} g {sg.materialName ? `de ${sg.materialName}` : ""}
                      {!sg.materialOk && <span className="ml-1 rounded bg-red-100 px-1 font-semibold text-red-800">falta filamento</span>}
                    </p>
                  </div>
                  <form action={createStockBatchAction} className="flex items-center gap-2">
                    <input type="hidden" name="productId" value={sg.product.id} />
                    {sg.variant && <input type="hidden" name="variantId" value={sg.variant.id} />}
                    <input type="hidden" name="priority" value="-1" />
                    <input type="hidden" name="notes" value="Fornada sugerida pela fila (estoque saudável)" />
                    <Input name="quantity" type="number" min={1} defaultValue={sg.shortfall} className="h-8 w-16 px-2 text-xs" />
                    <Button type="submit" size="sm" variant={sg.materialOk ? "default" : "outline"}>Adicionar à fila</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Novo job manual</CardTitle></CardHeader>
        <CardContent><PrintJobForm printers={prs} materials={mats} quotes={openQuotes} /></CardContent>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Concluídos recentemente</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {done.map((j) => (
                <li key={j.id} className="flex items-center gap-3 px-5 py-2 text-muted-foreground">
                  <span className="w-32 shrink-0 text-xs">{formatDate(j.finishedAt ?? j.updatedAt, true)}</span>
                  <span className="flex-1 truncate text-foreground">{j.title}</span>
                  <span className="text-xs">{j.producedQty ?? 0} boas · {j.failedQty ?? 0} perdidas · {j.actualGrams ?? 0} g{j.wasteGrams ? ` + ${j.wasteGrams} g desperdício` : ""} · {j.actualMinutes ?? j.estimatedMinutes} min</span>
                  <StatusBadge value={j.status} map={printJobStatusLabels} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
