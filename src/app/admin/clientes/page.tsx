import Link from "next/link";
import { Plus } from "lucide-react";
import { desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, CUSTOMER_STAGES, type CustomerStage } from "@/db/schema";
import { customerStageLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePagePermission } from "@/lib/auth";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  await requirePagePermission("customers.view");
  const { q, stage } = await searchParams;
  const stageFilter = CUSTOMER_STAGES.includes(stage as CustomerStage) ? (stage as CustomerStage) : null;

  const list = await db
    .select({
      c: customers,
      orderCount: sql<number>`(select count(*) from ${orders} where ${orders.customerId} = ${customers.id})`,
      spent: sql<number>`(select coalesce(sum(${orders.totalCents}),0) from ${orders} where ${orders.customerId} = ${customers.id} and ${orders.paymentStatus} = 'approved')`,
    })
    .from(customers)
    .where(
      q
        ? or(like(customers.name, `%${q}%`), like(customers.email, `%${q}%`), like(customers.phone, `%${q}%`), like(customers.instagram, `%${q}%`))
        : stageFilter
          ? eq(customers.stage, stageFilter)
          : undefined,
    )
    .orderBy(desc(customers.updatedAt))
    .limit(300);

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="CRM: leads, clientes ativos, histórico e follow-ups."
        actions={<Link href="/admin/clientes/novo" className="inline-flex h-10 items-center gap-2 rounded-lg bg-powder px-4 text-sm font-medium hover:bg-primary-strong"><Plus className="size-4" /> Novo cliente</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <form><Input name="q" defaultValue={q} placeholder="Buscar por nome, e-mail, telefone…" className="w-72" /></form>
        <Link href="/admin/clientes" className={cn("rounded-full border px-3 py-1", !stageFilter && !q && "bg-foreground text-blush")}>Todos</Link>
        {CUSTOMER_STAGES.map((s) => (
          <Link key={s} href={`/admin/clientes?stage=${s}`} className={cn("rounded-full border px-3 py-1 hover:bg-muted", stageFilter === s && "bg-foreground text-blush")}>{customerStageLabels[s].label}</Link>
        ))}
      </div>
      <Table>
        <THead><tr><TH>Cliente</TH><TH>Contato</TH><TH>Estágio</TH><TH>Origem</TH><TH className="text-right">Pedidos</TH><TH className="text-right">Gasto</TH><TH>Desde</TH></tr></THead>
        <TBody>
          {list.length === 0 && <EmptyRow colSpan={7}>Nenhum cliente encontrado.</EmptyRow>}
          {list.map(({ c, orderCount, spent }) => (
            <TR key={c.id}>
              <TD>
                <Link href={`/admin/clientes/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                {c.tags.length > 0 && <span className="block text-xs text-muted-foreground">{c.tags.join(", ")}</span>}
              </TD>
              <TD className="text-muted-foreground"><span className="block">{c.email ?? "—"}</span><span className="text-xs">{c.phone ?? ""}{c.instagram ? ` · @${c.instagram}` : ""}</span></TD>
              <TD><StatusBadge value={c.stage} map={customerStageLabels} /></TD>
              <TD className="text-muted-foreground">{c.source ?? "—"}</TD>
              <TD className="text-right">{orderCount}</TD>
              <TD className="text-right">{formatBRL(spent)}</TD>
              <TD className="text-muted-foreground">{formatDate(c.createdAt)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
