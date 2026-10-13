import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { quotes, QUOTE_STATUS, type QuoteStatus } from "@/db/schema";
import { quoteStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePagePermission } from "@/lib/auth";

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePagePermission("quotes.view");
  const { status } = await searchParams;
  const filter = QUOTE_STATUS.includes(status as QuoteStatus) ? (status as QuoteStatus) : null;
  const list = await db.query.quotes.findMany({
    where: filter ? eq(quotes.status, filter) : undefined,
    orderBy: desc(quotes.createdAt),
    with: { customer: true },
    limit: 200,
  });

  return (
    <div>
      <PageHeader title="Orçamentos" description="Projetos personalizados solicitados pelo site ou cadastrados aqui." />
      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        <Link href="/admin/orcamentos" className={cn("rounded-full border px-3 py-1", !filter && "bg-foreground text-blush")}>Todos</Link>
        {QUOTE_STATUS.map((s) => (
          <Link key={s} href={`/admin/orcamentos?status=${s}`} className={cn("rounded-full border px-3 py-1 hover:bg-muted", filter === s && "bg-foreground text-blush")}>{quoteStatusLabels[s].label}</Link>
        ))}
      </div>
      <Table>
        <THead><tr><TH>Orçamento</TH><TH>Cliente</TH><TH>Qtd.</TH><TH>Material</TH><TH>Status</TH><TH className="text-right">Preço</TH><TH>Data</TH></tr></THead>
        <TBody>
          {list.length === 0 && <EmptyRow colSpan={7}>Nenhum orçamento.</EmptyRow>}
          {list.map((q) => (
            <TR key={q.id}>
              <TD><Link href={`/admin/orcamentos/${q.id}`} className="font-medium hover:underline">{q.title}</Link><span className="block text-xs text-muted-foreground">{q.number}</span></TD>
              <TD>{q.customer ? <Link href={`/admin/clientes/${q.customer.id}`} className="hover:underline">{q.customer.name}</Link> : "—"}</TD>
              <TD>{q.quantity}</TD>
              <TD className="text-muted-foreground">{q.desiredMaterial ?? "—"}{q.desiredColor ? ` · ${q.desiredColor}` : ""}</TD>
              <TD><StatusBadge value={q.status} map={quoteStatusLabels} /></TD>
              <TD className="text-right">{q.priceCents ? formatBRL(q.priceCents) : "—"}</TD>
              <TD className="text-muted-foreground">{formatDate(q.createdAt)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
