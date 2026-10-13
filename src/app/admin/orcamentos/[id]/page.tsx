import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { materials, quotes } from "@/db/schema";
import { quoteStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { calcPrice } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { adminQuoteMessageAction } from "@/actions/quotes";
import { listAttachments } from "@/lib/uploads";
import { AttachmentList, FileInput } from "@/components/store/attachments";
import { QuoteAdminForm } from "@/components/admin/simple-forms";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePagePermission } from "@/lib/auth";

export default async function AdminQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("quotes.view");
  const { id } = await params;
  const [q, mats, s] = await Promise.all([
    db.query.quotes.findFirst({ where: eq(quotes.id, id), with: { customer: true, material: true, product: true, messages: { orderBy: (m, { asc }) => asc(m.createdAt) }, printJobs: true } }),
    db.query.materials.findMany({ where: eq(materials.active, true), orderBy: asc(materials.name) }),
    getSettings(),
  ]);
  if (!q) notFound();
  const files = await listAttachments("quote_message", q.messages.map((m) => m.id));

  const suggestion = q.material && q.estimatedGrams && q.estimatedMinutes
    ? calcPrice({
        materialGrams: q.estimatedGrams * q.quantity,
        materialCostPerKgCents: q.material.costPerKgCents,
        printMinutes: q.estimatedMinutes * q.quantity,
        printerHourlyCostCents: 150,
        laborMinutes: 30,
        laborHourlyCents: Number(s.pricing_labor_hourly_cents),
        failureRate: Number(s.pricing_failure_rate),
        marginPct: Number(s.pricing_margin_pct),
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={q.title}
        description={<>{q.number} · {formatDate(q.createdAt, true)}{q.product && <> · baseado em <Link href={`/admin/produtos/${q.product.id}`} className="underline">{q.product.name}</Link></>}</>}
        actions={
          <>
            <StatusBadge value={q.status} map={quoteStatusLabels} />
            <Link href={`/orcamento/${q.id}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-muted"><ExternalLink className="size-4" /> Página do cliente</Link>
            {q.orderId && <Link href={`/admin/pedidos/${q.orderId}`} className="inline-flex h-9 items-center rounded-lg bg-custard px-3 text-sm font-medium">Ver pedido gerado</Link>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Briefing do cliente</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-line">{q.description}</p>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div><dt className="text-xs uppercase text-muted-foreground">Qtd.</dt><dd>{q.quantity}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Material</dt><dd>{q.desiredMaterial ?? "—"}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Cor</dt><dd>{q.desiredColor ?? "—"}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Medidas</dt><dd>{q.dimensions ?? "—"}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">Prazo</dt><dd>{q.deadline ?? "—"}</dd></div>
              </dl>
              {q.referenceLinks.length > 0 && (
                <ul className="space-y-1">{q.referenceLinks.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer" className="break-all text-primary-strong hover:underline">{l}</a></li>)}</ul>
              )}
              {q.customer && (
                <p className="border-t pt-3 text-muted-foreground">
                  Cliente: <Link href={`/admin/clientes/${q.customer.id}`} className="font-medium text-foreground hover:underline">{q.customer.name}</Link> · {q.customer.email} · {q.customer.phone}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Conversa</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {q.messages.length === 0 ? <p className="text-sm text-muted-foreground">Sem mensagens.</p> : (
                <ul className="space-y-2">
                  {q.messages.map((m) => (
                    <li key={m.id} className={`rounded-lg border p-3 text-sm ${m.isInternal ? "border-dashed bg-custard/40" : "bg-muted/40"}`}>
                      <p className="mb-1 text-xs text-muted-foreground">{m.authorName ?? "—"} · {formatDate(m.createdAt, true)}{m.isInternal ? " · interno" : ""}</p>
                      <p className="whitespace-pre-line">{m.body}</p>
                      <AttachmentList files={files.filter((f) => f.refId === m.id)} />
                    </li>
                  ))}
                </ul>
              )}
              <form action={adminQuoteMessageAction} className="space-y-2">
                <input type="hidden" name="quoteId" value={q.id} />
                <Textarea name="body" placeholder="Responder ao cliente…" className="min-h-20" />
                <FileInput hint="Anexar prévia, render ou foto do teste (até 4 × 5 MB)" />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isInternal" className="accent-primary-strong" /> Nota interna (cliente não vê)</label>
                  <SubmitButton variant="secondary" pendingText="…">Enviar</SubmitButton>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Precificar</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <QuoteAdminForm quote={q} materials={mats} suggestion={suggestion ? { costCents: suggestion.costCents, priceCents: suggestion.suggestedPriceCents } : null} />
              {suggestion && (
                <div className="rounded-lg bg-muted p-3 text-xs">
                  <p className="mb-1 font-semibold">Sugestão (total para {q.quantity} un.)</p>
                  <dl className="grid grid-cols-2 gap-y-0.5 text-muted-foreground">
                    <dt>Material</dt><dd className="text-right">{formatBRL(suggestion.materialCents)}</dd>
                    <dt>Máquina</dt><dd className="text-right">{formatBRL(suggestion.machineCents)}</dd>
                    <dt>Mão de obra</dt><dd className="text-right">{formatBRL(suggestion.laborCents)}</dd>
                    <dt className="font-medium text-foreground">Custo</dt><dd className="text-right font-medium text-foreground">{formatBRL(suggestion.costCents)}</dd>
                    <dt className="font-medium text-foreground">Preço sugerido</dt><dd className="text-right font-medium text-foreground">{formatBRL(suggestion.suggestedPriceCents)}</dd>
                  </dl>
                  <p className="mt-1">Salve gramas/minutos + material para atualizar.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
