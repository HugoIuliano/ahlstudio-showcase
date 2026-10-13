import Image from "next/image";
import Link from "next/link";
import { Box, Plus } from "lucide-react";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { productStatusLabels } from "@/lib/labels";
import { thumbUrl } from "@/lib/media";
import { formatBRL } from "@/lib/money";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePagePermission } from "@/lib/auth";

export default async function AdminProductsPage() {
  await requirePagePermission("products.view");
  const list = await db.query.products.findMany({
    orderBy: [desc(products.updatedAt), asc(products.name)],
    with: { images: { orderBy: (i, { asc }) => asc(i.sortOrder) }, category: true, variants: true },
  });

  return (
    <div>
      <PageHeader
        title="Produtos"
        description={`${list.length} cadastrados`}
        actions={<Link href="/admin/produtos/novo" className="inline-flex h-10 items-center gap-2 rounded-lg bg-powder px-4 text-sm font-medium hover:bg-primary-strong"><Plus className="size-4" /> Novo produto</Link>}
      />
      <Table>
        <THead>
          <tr><TH>Produto</TH><TH>Categoria</TH><TH>Tags</TH><TH className="text-right">Preço</TH><TH className="text-right">Estoque</TH><TH>Status</TH></tr>
        </THead>
        <TBody>
          {list.length === 0 && <EmptyRow colSpan={6}>Nenhum produto. Crie o primeiro.</EmptyRow>}
          {list.map((p) => {
            const stock = p.variants.length ? p.variants.reduce((s, v) => s + v.stockQty, 0) : p.stockQty;
            return (
              <TR key={p.id}>
                <TD>
                  <Link href={`/admin/produtos/${p.id}`} className="flex items-center gap-3 hover:underline">
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-blush">
                      {thumbUrl(p.images) ? <Image src={thumbUrl(p.images)!} alt="" fill sizes="40px" className="object-cover" /> : <Box className="m-auto mt-2.5 size-5 text-muted-foreground" />}
                    </span>
                    <span>
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.sku ?? p.slug}{p.variants.length ? ` · ${p.variants.length} variações` : ""}</span>
                    </span>
                  </Link>
                </TD>
                <TD className="text-muted-foreground">{p.category?.name ?? "—"}</TD>
                <TD className="text-xs text-muted-foreground">{p.tags.join(", ") || "—"}</TD>
                <TD className="text-right">{formatBRL(p.priceCents)}</TD>
                <TD className={`text-right ${stock <= 0 ? "text-muted-foreground" : ""}`}>{stock <= 0 ? "sob demanda" : stock}</TD>
                <TD><StatusBadge value={p.status} map={productStatusLabels} /></TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
