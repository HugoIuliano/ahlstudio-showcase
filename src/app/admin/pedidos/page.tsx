import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, ORDER_STATUS, type OrderStatus } from "@/db/schema";
import { orderStatusLabels, paymentMethodLabels, paymentStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePagePermission } from "@/lib/auth";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePagePermission("orders.view");
  const { status } = await searchParams;
  const filter = ORDER_STATUS.includes(status as OrderStatus) ? (status as OrderStatus) : null;
  const list = await db.query.orders.findMany({
    where: filter ? eq(orders.status, filter) : undefined,
    orderBy: desc(orders.createdAt),
    with: { items: true },
    limit: 200,
  });

  return (
    <div>
      <PageHeader title="Pedidos" description={`${list.length} pedido(s)`} />
      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        <Link href="/admin/pedidos" className={cn("rounded-full border px-3 py-1", !filter && "bg-foreground text-blush")}>Todos</Link>
        {ORDER_STATUS.map((s) => (
          <Link key={s} href={`/admin/pedidos?status=${s}`} className={cn("rounded-full border px-3 py-1 hover:bg-muted", filter === s && "bg-foreground text-blush")}>{orderStatusLabels[s].label}</Link>
        ))}
      </div>
      <Table>
        <THead><tr><TH>Pedido</TH><TH>Cliente</TH><TH>Itens</TH><TH>Status</TH><TH>Pagamento</TH><TH className="text-right">Total</TH><TH>Data</TH></tr></THead>
        <TBody>
          {list.length === 0 && <EmptyRow colSpan={7}>Nenhum pedido.</EmptyRow>}
          {list.map((o) => (
            <TR key={o.id}>
              <TD><Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">{o.number}</Link></TD>
              <TD><span className="block">{o.customerName}</span><span className="text-xs text-muted-foreground">{o.customerPhone ?? o.customerEmail}</span></TD>
              <TD className="max-w-xs truncate text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</TD>
              <TD><StatusBadge value={o.status} map={orderStatusLabels} /></TD>
              <TD><div className="flex flex-col gap-0.5"><StatusBadge value={o.paymentStatus} map={paymentStatusLabels} /><span className="text-xs text-muted-foreground">{paymentMethodLabels[o.paymentMethod]}</span></div></TD>
              <TD className="text-right font-medium">{formatBRL(o.totalCents)}</TD>
              <TD className="text-muted-foreground">{formatDate(o.createdAt, true)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
