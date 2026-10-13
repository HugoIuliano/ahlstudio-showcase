import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { ticketCategoryLabels, ticketStatusLabels } from "@/lib/labels";
import { canAccessTicket } from "@/lib/security";
import { listAttachments } from "@/lib/uploads";
import { formatDate } from "@/lib/utils";
import { customerTicketReplyAction } from "@/actions/tickets";
import { AttachmentList, FileInput } from "@/components/store/attachments";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata = { title: "Chamado" };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; aviso?: string }> }) {
  const { id } = await params;
  const { t, aviso } = await searchParams;
  const [ticket, session] = await Promise.all([
    db.query.tickets.findFirst({ where: eq(tickets.id, id), with: { order: true, quote: true, messages: { orderBy: (m, { asc }) => asc(m.createdAt) } } }),
    auth(),
  ]);
  if (!ticket) notFound();
  if (!canAccessTicket(ticket, session?.user, t)) {
    if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/ajuda/chamados/${id}`)}`);
    notFound();
  }
  const visible = ticket.messages.filter((m) => !m.isInternal);
  const files = await listAttachments("ticket_message", visible.map((m) => m.id));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/ajuda" className="text-sm text-muted-foreground hover:text-foreground">← Central de ajuda</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          <StatusBadge value={ticket.status} map={ticketStatusLabels} />
        </div>
        <p className="text-sm text-muted-foreground">
          {ticket.number} · {ticketCategoryLabels[ticket.category]} · {formatDate(ticket.createdAt)}
          {ticket.order && <> · pedido <Link href={`/pedido/${ticket.order.id}`} className="underline">{ticket.order.number}</Link></>}
          {ticket.quote && <> · orçamento <Link href={`/orcamento/${ticket.quote.id}`} className="underline">{ticket.quote.number}</Link></>}
        </p>
      </div>

      {aviso && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Alguns anexos não foram aceitos: {aviso}</p>}
      {!session?.user && <p className="rounded-2xl border bg-card p-3 text-sm text-muted-foreground">Guarde este link para acompanhar. Com uma <Link href="/cadastro" className="underline">conta</Link> no e-mail {ticket.email} você vê todos os chamados em Minha conta.</p>}

      <Card>
        <CardHeader><CardTitle>Conversa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {visible.map((m) => (
              <li key={m.id} className={`rounded-xl border p-3 text-sm ${m.fromAdmin ? "bg-rose/40" : "bg-muted/40"}`}>
                <p className="mb-1 text-xs text-muted-foreground">{m.fromAdmin ? `${m.authorName ?? "Studio"} (studio)` : m.authorName ?? "Você"} · {formatDate(m.createdAt, true)}</p>
                <p className="whitespace-pre-line">{m.body}</p>
                <AttachmentList files={files.filter((f) => f.refId === m.id)} token={t} />
              </li>
            ))}
          </ul>
          {ticket.status !== "closed" ? (
            <form action={customerTicketReplyAction} className="space-y-2 border-t pt-4">
              <input type="hidden" name="ticketId" value={ticket.id} />
              {t && <input type="hidden" name="t" value={t} />}
              <Textarea name="body" placeholder="Responder…" className="min-h-20" />
              <FileInput />
              <SubmitButton variant="secondary" pendingText="Enviando…">Enviar</SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Chamado fechado. Se precisar, <Link href="/ajuda#chamado" className="underline">abra um novo</Link>.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
