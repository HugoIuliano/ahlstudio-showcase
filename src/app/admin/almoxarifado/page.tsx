import Link from "next/link";
import { Trash2 } from "lucide-react";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { products, supplies, supplyMovements } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth";
import { inventoryValuation } from "@/lib/finance";
import { supplyCategoryLabels, supplyReasonLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { deleteSupplyAction } from "@/actions/finance";
import { SupplyForm, SupplyMovementForm } from "@/components/admin/finance-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function WarehousePage() {
  await requirePagePermission("stock.view");
  const [list, moves, inv, prods] = await Promise.all([
    db.query.supplies.findMany({ orderBy: asc(supplies.name), with: { usedIn: { with: { product: { columns: { name: true } } } } } }),
    db.query.supplyMovements.findMany({ orderBy: desc(supplyMovements.createdAt), limit: 40, with: { supply: true } }),
    inventoryValuation(),
    db.query.products.findMany({ orderBy: asc(products.name), with: { variants: true } }),
  ]);
  const low = list.filter((s) => s.active && s.qty <= s.minQty);

  return (
    <div className="space-y-6">
      <PageHeader title="Almoxarifado" description="Insumos além do filamento (embalagem, ferragens, LEDs, acabamento) e visão do estoque de produtos prontos. Insumos na ficha técnica são baixados automaticamente ao concluir fornadas." actions={<Link href="/admin/estoque" className="inline-flex h-8 items-center rounded-lg border bg-card px-3 text-xs font-medium hover:bg-muted">Filamentos →</Link>} />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Insumos (valor)" value={formatBRL(inv.supplyCents)} hint={`${list.filter((s) => s.active).length} itens ativos`} />
        <Stat label="Insumos em baixa" value={low.length} tone={low.length ? "danger" : undefined} hint={low.map((s) => s.name).join(", ")} />
        <Stat label="Produtos prontos" value={`${inv.productUnits} un.`} hint={formatBRL(inv.productCents)} />
        <Stat label="Estoque total (ao custo)" value={formatBRL(inv.totalCents)} hint="produtos + filamento + insumos" />
      </div>

      <Table>
        <THead><tr><TH>Insumo</TH><TH>Categoria</TH><TH className="text-right">Qtd.</TH><TH className="text-right">Mínimo</TH><TH className="text-right">Custo unit.</TH><TH className="text-right">Valor</TH><TH>Local / fornecedor</TH><TH>Usado em</TH><TH></TH></tr></THead>
        <TBody>
          {list.length === 0 && <EmptyRow colSpan={9}>Nenhum insumo. Cadastre abaixo.</EmptyRow>}
          {list.map((s) => (
            <TR key={s.id} className={!s.active ? "opacity-50" : ""}>
              <TD><span className="font-medium">{s.name}</span>{s.sku && <span className="block text-xs text-muted-foreground">{s.sku}</span>}</TD>
              <TD className="text-muted-foreground">{supplyCategoryLabels[s.category]}</TD>
              <TD className={cn("text-right font-medium", s.qty <= s.minQty && "text-danger")}>{s.qty} {s.unit}</TD>
              <TD className="text-right text-muted-foreground">{s.minQty}</TD>
              <TD className="text-right">{formatBRL(s.unitCostCents)}</TD>
              <TD className="text-right">{formatBRL(Math.round(s.qty * s.unitCostCents))}</TD>
              <TD className="text-xs text-muted-foreground">{[s.location, s.supplier].filter(Boolean).join(" · ") || "—"}</TD>
              <TD className="text-xs text-muted-foreground">{s.usedIn.map((u) => u.product.name).join(", ") || "—"}</TD>
              <TD>
                <form action={deleteSupplyAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button type="submit" variant="ghost" size="icon" aria-label="Excluir"><Trash2 className="text-muted-foreground" /></Button>
                </form>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Movimentar insumo</CardTitle><p className="text-sm text-muted-foreground">Compra atualiza o custo unitário e lança a despesa (COGS).</p></CardHeader>
          <CardContent><SupplyMovementForm supplies={list.filter((s) => s.active)} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Novo insumo</CardTitle></CardHeader>
          <CardContent><SupplyForm /></CardContent>
        </Card>
      </div>

      {list.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Editar insumos</CardTitle></CardHeader>
          <CardContent className="divide-y">{list.map((s) => <div key={s.id} className="py-4 first:pt-0 last:pb-0"><SupplyForm supply={s} /></div>)}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Estoque de produtos prontos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><tr><TH>Produto</TH><TH className="text-right">Estoque</TH><TH className="text-right">Custo un.</TH><TH className="text-right">Valor ao custo</TH><TH className="text-right">Valor de venda</TH></tr></THead>
            <TBody>
              {prods.filter((p) => p.kind === "stock").map((p) => {
                const qty = p.variants.length ? p.variants.reduce((a, v) => a + v.stockQty, 0) : p.stockQty;
                return (
                  <TR key={p.id}>
                    <TD><Link href={`/admin/produtos/${p.id}`} className="font-medium hover:underline">{p.name}</Link>{p.variants.length > 0 && <span className="block text-xs text-muted-foreground">{p.variants.map((v) => `${v.value}: ${v.stockQty}`).join(" · ")}</span>}</TD>
                    <TD className={cn("text-right font-medium", qty < 0 && "text-danger")}>{qty}</TD>
                    <TD className="text-right">{formatBRL(p.costCents)}</TD>
                    <TD className="text-right">{formatBRL(Math.max(0, qty) * p.costCents)}</TD>
                    <TD className="text-right text-muted-foreground">{formatBRL(Math.max(0, qty) * p.priceCents)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Últimas movimentações</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y text-sm">
            {moves.length === 0 && <li className="p-5 text-muted-foreground">Nenhuma movimentação.</li>}
            {moves.map((mv) => (
              <li key={mv.id} className="flex items-center gap-3 px-5 py-2">
                <span className="w-32 shrink-0 text-xs text-muted-foreground">{formatDate(mv.createdAt, true)}</span>
                <span className="font-medium">{mv.supply.name}</span>
                <span className={`w-24 text-right font-mono ${mv.delta < 0 ? "text-danger" : "text-emerald-700"}`}>{mv.delta > 0 ? "+" : ""}{mv.delta} {mv.supply.unit}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{supplyReasonLabels[mv.reason]}</span>
                <span className="truncate text-muted-foreground">{mv.note}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
