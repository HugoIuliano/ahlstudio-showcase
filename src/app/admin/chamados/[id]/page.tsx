import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tickets, TICKET_STATUS } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth";
import { ticketCategoryLabels, ticketStatusLabels } from "@/lib/labels";
import { whatsappLink } from "@/lib/settings";
import { listAttachments } from "@/lib/uploads";
import { formatDate } from "@/lib/utils";
import { adminTicketReplyAction, setTicketStatusAction } from "@/actions/tickets";
import { AttachmentList, FileInput } from "@/components/store/attachments";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("tickets.view");
  const { id } = await params;
  const t = await db.query.tickets.findFirst({
    where: eq(tickets.id, id),
    with: { customer: true, order: true, quote: true, messages: { orderBy: (m, { asc }) => asc(m.createdAt) } },
  });
  if (!t) notFound();
  const files = await listAttachments("ticket_message", t.messages.map((m) => m.id));
  const wa = t.customer?.phone ? whatsappLink(t.customer.phone, `Olá ${t.name.split(" ")[0]}! Sobre seu chamado ${t.number}…`) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.subject}
        description={`${t.number} · ${ticketCategoryLabels[t.category]} · aberto em ${formatDate(t.createdAt, true)}`}
        actions={
          <>
            <StatusBadge value={t.status} map={ticketStatusLabels} />
            <Link href={`/ajuda/chamados/${t.id}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-muted"><ExternalLink className="size-4" /> Página do cliente</Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader><CardTitle>Conversa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {t.messages.map((m) => (
                <li key={m.id} className={`rounded-xl border p-3 text-sm ${m.isInternal ? "border-dashed bg-custard/40" : m.fromAdmin ? "bg-rose/40" : "bg-muted/40"}`}>
                  <p className="mb-1 text-xs text-muted-foreground">{m.authorName ?? "—"}{m.fromAdmin ? " (studio)" : ""} · {formatDate(m.createdAt, true)}{m.isInternal ? " · interno" : ""}</p>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <AttachmentList files={files.filter((f) => f.refId === m.id)} />
                </li>
              ))}
            </ul>
            <form action={adminTicketReplyAction} className="space-y-2 border-t pt-4">
              <input type="hidden" name="ticketId" value={t.id} />
              <Textarea name="body" placeholder="Responder ao cliente…" className="min-h-24" />
              <FileInput />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isInternal" className="accent-primary-strong" /> Nota interna</label>
                <div className="flex items-center gap-2">
                  <Select name="status" defaultValue="" className="h-9 w-48">
                    <option value="">Manter status (→ aguardando cliente)</option>
                    {TICKET_STATUS.map((s) => <option key={s} value={s}>Marcar: {ticketStatusLabels[s].label}</option>)}
                  </Select>
                  <SubmitButton pendingText="Enviando…">Enviar</SubmitButton>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{t.customer ? <Link href={`/admin/clientes/${t.customer.id}`} className="hover:underline">{t.name}</Link> : t.name}</p>
              <p className="text-muted-foreground">{t.email}</p>
              {t.customer?.phone && <p className="text-muted-foreground">{t.customer.phone}</p>}
              {wa && <a href={wa} target="_blank" rel="noreferrer noopener" className="inline-block pt-1 text-emerald-700 hover:underline">Abrir WhatsApp</a>}
              {t.order && <p className="pt-2">Pedido: <Link href={`/admin/pedidos/${t.order.id}`} className="underline">{t.order.number}</Link></p>}
              {t.quote && <p>Orçamento: <Link href={`/admin/orcamentos/${t.quote.id}`} className="underline">{t.quote.number}</Link></p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Status e prioridade</CardTitle></CardHeader>
            <CardContent>
              <form action={setTicketStatusAction} className="space-y-3">
                <input type="hidden" name="ticketId" value={t.id} />
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue={t.status}>{TICKET_STATUS.map((s) => <option key={s} value={s}>{ticketStatusLabels[s].label}</option>)}</Select>
                </div>
                <div>
                  <Label>Prioridade (0–3)</Label>
                  <Input name="priority" type="number" min={0} max={3} defaultValue={t.priority} />
                </div>
                <Button type="submit" variant="secondary" className="w-full">Salvar</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
