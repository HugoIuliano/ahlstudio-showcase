import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { consents, customers, tickets, INTERACTION_TYPES } from "@/db/schema";
import { desc } from "drizzle-orm";
import { customerStageLabels, interactionTypeLabels, orderStatusLabels, quoteStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { whatsappLink } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { addInteractionAction, deleteCustomerAction, deleteInteractionAction } from "@/actions/crm";
import { CustomerForm } from "@/components/admin/simple-forms";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader, Stat } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("customers.view");
  const { id } = await params;
  const c = await db.query.customers.findFirst({
    where: eq(customers.id, id),
    with: {
      orders: { orderBy: (o, { desc }) => desc(o.createdAt) },
      quotes: { orderBy: (q, { desc }) => desc(q.createdAt) },
      interactions: { orderBy: (i, { desc }) => desc(i.createdAt), with: { author: true } },
      user: true,
    },
  });
  if (!c) notFound();
  const [customerConsents, customerTickets] = await Promise.all([
    c.email ? db.query.consents.findMany({ where: eq(consents.email, c.email), orderBy: desc(consents.createdAt), limit: 20 }) : [],
    c.email ? db.query.tickets.findMany({ where: eq(tickets.email, c.email), orderBy: desc(tickets.updatedAt), limit: 10 }) : [],
  ]);
  const spent = c.orders.filter((o) => o.paymentStatus === "approved").reduce((s, o) => s + o.totalCents, 0);
  const wa = whatsappLink(c.phone ?? "", `Olá ${c.name.split(" ")[0]}! Aqui é da AHL Studio.`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        description={<span className="flex items-center gap-2"><StatusBadge value={c.stage} map={customerStageLabels} /> {c.user ? "· tem conta no site" : "· sem conta"} · desde {formatDate(c.createdAt)}</span>}
        actions={
          <>
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700">WhatsApp</a>}
            <form action={deleteCustomerAction}>
              <input type="hidden" name="id" value={c.id} />
              <Button type="submit" variant="danger" size="sm"><Trash2 /> Excluir</Button>
            </form>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pedidos" value={c.orders.length} />
        <Stat label="Total gasto" value={formatBRL(spent)} />
        <Stat label="Orçamentos" value={c.quotes.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Dados</CardTitle></CardHeader>
            <CardContent><CustomerForm customer={c} /></CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Histórico de contato</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form action={addInteractionAction} className="grid gap-2 sm:grid-cols-[130px_1fr]">
                <input type="hidden" name="customerId" value={c.id} />
                <Select name="type" defaultValue="whatsapp">{INTERACTION_TYPES.map((t) => <option key={t} value={t}>{interactionTypeLabels[t]}</option>)}</Select>
                <Textarea name="content" required placeholder="O que foi conversado / próximo passo…" className="min-h-16" />
                <div className="text-xs text-muted-foreground sm:pt-2">Follow-up em</div>
                <div className="flex gap-2">
                  <Input name="followUpAt" type="date" className="w-44" />
                  <Button type="submit" variant="secondary">Registrar</Button>
                </div>
              </form>
              {c.interactions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro.</p> : (
                <ul className="space-y-2">
                  {c.interactions.map((i) => (
                    <li key={i.id} className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-card px-1.5 py-0.5 font-medium">{interactionTypeLabels[i.type]}</span>
                        <span>{formatDate(i.createdAt, true)}</span>
                        {i.author?.name && <span>· {i.author.name}</span>}
                        {i.followUpAt && <span className={i.followUpAt < new Date() ? "text-danger" : "text-amber-700"}>· follow-up {formatDate(i.followUpAt)}</span>}
                        <form action={deleteInteractionAction} className="ml-auto">
                          <input type="hidden" name="id" value={i.id} />
                          <input type="hidden" name="customerId" value={c.id} />
                          <button type="submit" className="hover:text-danger" aria-label="Excluir"><Trash2 className="size-3.5" /></button>
                        </form>
                      </div>
                      <p className="whitespace-pre-line">{i.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pedidos</CardTitle></CardHeader>
            <CardContent className="p-0">
              {c.orders.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum pedido.</p> : (
                <ul className="divide-y text-sm">
                  {c.orders.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-5 py-2.5">
                      <Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">{o.number}</Link>
                      <span className="flex-1 text-muted-foreground">{formatDate(o.createdAt)}</span>
                      <StatusBadge value={o.status} map={orderStatusLabels} />
                      <span className="w-24 text-right">{formatBRL(o.totalCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Chamados</CardTitle></CardHeader>
            <CardContent className="p-0">
              {customerTickets.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum chamado.</p> : (
                <ul className="divide-y text-sm">
                  {customerTickets.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                      <Link href={`/admin/chamados/${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{t.subject}</Link>
                      <span className="text-xs text-muted-foreground">{t.number} · {t.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Consentimentos (LGPD)</CardTitle></CardHeader>
            <CardContent className="p-0">
              {customerConsents.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum registro.</p> : (
                <ul className="divide-y text-xs">
                  {customerConsents.map((k) => (
                    <li key={k.id} className="flex items-center gap-3 px-5 py-2">
                      <span className="font-medium">{k.type}</span>
                      <span className="text-muted-foreground">v{k.version}</span>
                      <span className="flex-1 text-muted-foreground">{formatDate(k.createdAt, true)}</span>
                      <span className="font-mono text-muted-foreground">{k.ip ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Orçamentos</CardTitle></CardHeader>
            <CardContent className="p-0">
              {c.quotes.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum orçamento.</p> : (
                <ul className="divide-y text-sm">
                  {c.quotes.map((q) => (
                    <li key={q.id} className="flex items-center gap-3 px-5 py-2.5">
                      <Link href={`/admin/orcamentos/${q.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{q.title}</Link>
                      <StatusBadge value={q.status} map={quoteStatusLabels} />
                      <span className="w-24 text-right">{q.priceCents ? formatBRL(q.priceCents) : "—"}</span>
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
