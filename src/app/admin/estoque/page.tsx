import { Trash2 } from "lucide-react";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { materials, stockMovements } from "@/db/schema";
import { stockReasonLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { deleteMaterialAction } from "@/actions/erp";
import { MaterialForm, StockMovementForm } from "@/components/admin/simple-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePagePermission } from "@/lib/auth";

export default async function StockPage() {
  await requirePagePermission("stock.view");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [mats, moves, wasteMoves] = await Promise.all([
    db.query.materials.findMany({ orderBy: asc(materials.name) }),
    db.query.stockMovements.findMany({ orderBy: desc(stockMovements.createdAt), limit: 40, with: { material: true } }),
    db.query.stockMovements.findMany({ where: and(eq(stockMovements.reason, "waste"), gte(stockMovements.createdAt, monthStart)), with: { material: true } }),
  ]);
  const wasteGrams = wasteMoves.reduce((s, m) => s + Math.abs(m.deltaGrams), 0);
  const wasteCents = wasteMoves.reduce((s, m) => s + Math.round((Math.abs(m.deltaGrams) / 1000) * m.material.costPerKgCents), 0);
  const totalGrams = mats.reduce((s, m) => s + m.stockGrams, 0);
  const totalValue = mats.reduce((s, m) => s + (m.stockGrams / 1000) * m.costPerKgCents, 0);
  const low = mats.filter((m) => m.active && m.stockGrams <= m.minStockGrams);

  return (
    <div className="space-y-6">
      <PageHeader title="Materiais & estoque" description="Filamentos e resinas em gramas. A fila de impressão baixa o estoque automaticamente ao concluir." />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Desperdício no mês" value={`${wasteGrams} g`} tone={wasteGrams > 0 ? "warning" : undefined} hint={`${formatBRL(wasteCents)} em filamento perdido`} />
        <Stat label="Estoque total" value={`${(totalGrams / 1000).toFixed(2)} kg`} />
        <Stat label="Valor em estoque" value={formatBRL(Math.round(totalValue))} />
        <Stat label="Em baixa" value={low.length} tone={low.length ? "danger" : undefined} hint={low.map((m) => m.name).join(", ")} />
      </div>

      <Table>
        <THead><tr><TH>Material</TH><TH>Tipo</TH><TH className="text-right">Estoque</TH><TH className="text-right">Mínimo</TH><TH className="text-right">Custo/kg</TH><TH>Fornecedor</TH><TH></TH></tr></THead>
        <TBody>
          {mats.length === 0 && <EmptyRow colSpan={7}>Nenhum material. Cadastre abaixo.</EmptyRow>}
          {mats.map((m) => (
            <TR key={m.id} className={!m.active ? "opacity-50" : ""}>
              <TD><span className="flex items-center gap-2">{m.colorHex && <span className="size-4 rounded-full border" style={{ background: m.colorHex }} />}<span className="font-medium">{m.name}</span>{m.brand && <span className="text-xs text-muted-foreground">{m.brand}</span>}</span></TD>
              <TD>{m.type}</TD>
              <TD className={`text-right font-medium ${m.stockGrams <= m.minStockGrams ? "text-danger" : ""}`}>{m.stockGrams} g</TD>
              <TD className="text-right text-muted-foreground">{m.minStockGrams} g</TD>
              <TD className="text-right">{formatBRL(m.costPerKgCents)}</TD>
              <TD className="text-muted-foreground">{m.supplier ?? "—"}</TD>
              <TD>
                <form action={deleteMaterialAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <Button type="submit" variant="ghost" size="icon" aria-label="Excluir"><Trash2 className="text-muted-foreground" /></Button>
                </form>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Movimentar estoque</CardTitle></CardHeader>
          <CardContent><StockMovementForm materials={mats.filter((m) => m.active)} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Novo material</CardTitle></CardHeader>
          <CardContent><MaterialForm /></CardContent>
        </Card>
      </div>

      {mats.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Editar materiais</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {mats.map((m) => <div key={m.id} className="py-4 first:pt-0 last:pb-0"><MaterialForm material={m} /></div>)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Últimas movimentações</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y text-sm">
            {moves.length === 0 && <li className="p-5 text-muted-foreground">Nenhuma movimentação.</li>}
            {moves.map((mv) => (
              <li key={mv.id} className="flex items-center gap-3 px-5 py-2">
                <span className="w-32 shrink-0 text-xs text-muted-foreground">{formatDate(mv.createdAt, true)}</span>
                <span className="font-medium">{mv.material.name}</span>
                <span className={`w-20 text-right font-mono ${mv.deltaGrams < 0 ? "text-danger" : "text-emerald-700"}`}>{mv.deltaGrams > 0 ? "+" : ""}{mv.deltaGrams} g</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{stockReasonLabels[mv.reason]}</span>
                <span className="truncate text-muted-foreground">{mv.note}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
