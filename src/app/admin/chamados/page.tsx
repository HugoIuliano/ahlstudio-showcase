import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tickets, TICKET_STATUS, type TicketStatus } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth";
import { ticketCategoryLabels, ticketStatusLabels } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePagePermission("tickets.view");
  const { status } = await searchParams;
  const filter = TICKET_STATUS.includes(status as TicketStatus) ? (status as TicketStatus) : null;
  const list = await db.query.tickets.findMany({
    where: filter ? eq(tickets.status, filter) : undefined,
    orderBy: [desc(tickets.priority), desc(tickets.updatedAt)],
    with: { messages: { columns: { id: true } } },
    limit: 200,
  });
  const waiting = list.filter((t) => t.status === "open");

  return (
    <div>
      <PageHeader title="Chamados" description={`${waiting.length} aguardando resposta · ${list.length} no filtro`} />
      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        <Link href="/admin/chamados" className={cn("rounded-full border px-3 py-1", !filter && "bg-foreground text-blush")}>Todos</Link>
        {TICKET_STATUS.map((s) => (
          <Link key={s} href={`/admin/chamados?status=${s}`} className={cn("rounded-full border px-3 py-1 hover:bg-muted", filter === s && "bg-foreground text-blush")}>{ticketStatusLabels[s].label}</Link>
        ))}
      </div>
      <Table>
        <THead><tr><TH>Chamado</TH><TH>Cliente</TH><TH>Categoria</TH><TH>Status</TH><TH className="text-right">Msgs</TH><TH>Última atividade</TH></tr></THead>
        <TBody>
          {list.length === 0 && <EmptyRow colSpan={6}>Nenhum chamado.</EmptyRow>}
          {list.map((t) => {
            const overdue = t.status === "open" && t.lastCustomerMessageAt && new Date().getTime() - t.lastCustomerMessageAt.getTime() > 86400000 * 2;
            return (
              <TR key={t.id} className={overdue ? "bg-red-50/60" : ""}>
                <TD>
                  <Link href={`/admin/chamados/${t.id}`} className="font-medium hover:underline">{t.subject}</Link>
                  <span className="block text-xs text-muted-foreground">{t.number}{t.priority > 0 ? ` · prioridade ${t.priority}` : ""}{overdue ? " · +48h sem resposta" : ""}</span>
                </TD>
                <TD><span className="block">{t.name}</span><span className="text-xs text-muted-foreground">{t.email}</span></TD>
                <TD className="text-muted-foreground">{ticketCategoryLabels[t.category]}</TD>
                <TD><StatusBadge value={t.status} map={ticketStatusLabels} /></TD>
                <TD className="text-right">{t.messages.length}</TD>
                <TD className="text-muted-foreground">{formatDate(t.updatedAt, true)}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
