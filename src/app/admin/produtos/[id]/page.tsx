import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Factory, Trash2 } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { asc as ascOrder } from "drizzle-orm";
import { categories, materials, printers, products, supplies } from "@/db/schema";
import { printJobStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { bomMaterialCents } from "@/lib/production";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { addVariantAction, deleteProductAction, deleteVariantAction } from "@/actions/catalog";
import { createStockBatchAction } from "@/actions/erp";
import { ProductForm } from "@/components/admin/product-form";
import { ProductSuppliesEditor } from "@/components/admin/finance-forms";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { PageHeader, Stat } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePagePermission } from "@/lib/auth";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("products.view");
  const { id } = await params;
  const [product, cats, mats, prs, s] = await Promise.all([
    db.query.products.findFirst({
      where: eq(products.id, id),
      with: {
        images: { orderBy: (i, { asc }) => asc(i.sortOrder) },
        variants: { orderBy: (v, { asc }) => asc(v.sortOrder), with: { material: true } },
        bom: { orderBy: (b, { asc }) => asc(b.sortOrder), with: { material: true } },
        suppliesBom: { orderBy: (b, { asc }) => asc(b.sortOrder), with: { supply: true } },
        printJobs: { orderBy: (j, { desc }) => desc(j.createdAt), limit: 20, with: { printer: true, variant: true } },
      },
    }),
    db.query.categories.findMany({ orderBy: asc(categories.sortOrder) }),
    db.query.materials.findMany({ orderBy: asc(materials.name) }),
    db.query.printers.findMany({ orderBy: asc(printers.name) }),
    getSettings(),
  ]);
  const supplyList = await db.query.supplies.findMany({ where: (s, { eq }) => eq(s.active, true), orderBy: ascOrder(supplies.name) });
  if (!product) notFound();
  const suppliesCostCents = product.suppliesBom.reduce((a, l) => a + Math.round(l.supply.unitCostCents * l.qtyPerUnit), 0);
  const printerHourlyCents = prs.length ? Math.round(prs.reduce((a, p) => a + p.hourlyCostCents, 0) / prs.length) : 150;

  // Indicadores de produção realizados (fornadas concluídas)
  const finished = product.printJobs.filter((j) => j.finishedAt);
  const produced = finished.reduce((a, j) => a + (j.producedQty ?? 0), 0);
  const failed = finished.reduce((a, j) => a + (j.failedQty ?? 0), 0);
  const wasteG = finished.reduce((a, j) => a + (j.wasteGrams ?? 0), 0);
  const gramsPerGood = produced > 0 ? Math.round(finished.reduce((a, j) => a + (j.actualGrams ?? 0) + (j.wasteGrams ?? 0), 0) / produced) : null;
  const bomG = product.bom.reduce((a, l) => a + l.gramsPerUnit, 0);
  const materialCents = bomMaterialCents(product.bom, mats);
  const variantStock = product.variants.reduce((a, v) => a + v.stockQty, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title={product.name}
        description={<span className="font-mono text-xs">/produtos/{product.slug}</span>}
        actions={
          <>
            {product.status === "active" && (
              <Link href={`/produtos/${product.slug}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-muted"><ExternalLink className="size-4" /> Ver na loja</Link>
            )}
            <form action={deleteProductAction}>
              <input type="hidden" name="id" value={product.id} />
              <Button type="submit" variant="danger" size="sm"><Trash2 /> Excluir</Button>
            </form>
          </>
        }
      />

      {/* ===== ERP: visão rápida ===== */}
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Estoque pronto" value={product.variants.length ? `${variantStock} un.` : `${product.stockQty} un.`} hint={product.variants.length ? "soma das variações" : undefined} />
        <Stat label="Material/un. (ficha)" value={`${bomG} g`} hint={product.bom.map((l) => `${l.material.name} ${l.gramsPerUnit}g`).join(" · ") || "sem ficha técnica"} />
        <Stat label="Custo material/un." value={formatBRL(materialCents + suppliesCostCents)} hint={`filamento ${formatBRL(materialCents)} + insumos ${formatBRL(suppliesCostCents)} · registrado ${formatBRL(product.costCents)}`} />
        <Stat label="Produzidas" value={produced} hint={`${finished.length} fornada(s)`} />
        <Stat label="Perdidas" value={failed} tone={failed > 0 ? "warning" : undefined} hint={produced + failed > 0 ? `${Math.round((failed / (produced + failed)) * 100)}% de perda` : undefined} />
        <Stat label="Desperdício" value={`${wasteG} g`} tone={wasteG > 0 ? "warning" : undefined} hint={gramsPerGood != null ? `real: ${gramsPerGood} g por peça boa` : undefined} />
      </div>

      <ProductForm
        product={product}
        categories={cats}
        materials={mats}
        pricing={{ laborHourlyCents: Number(s.pricing_labor_hourly_cents), failureRate: Number(s.pricing_failure_rate), marginPct: Number(s.pricing_margin_pct), printerHourlyCents }}
        lead={{ hoursPerDay: Number(s.production_hours_per_day) || 8, machines: Number(s.production_parallel_machines) || 1, laborHoursPerDay: Number(s.production_labor_hours_per_day) || 4, handlingDays: Number(s.shipping_handling_days) || 0 }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Variações</CardTitle>
            <p className="text-sm text-muted-foreground">Ex.: Cor = Preto. Acréscimo soma ao preço; estoque e filamento por variação.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {product.variants.length > 0 && (
              <ul className="divide-y rounded-lg border text-sm">
                {product.variants.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-3 py-2">
                    {v.colorHex && <span className="size-4 rounded-full border" style={{ background: v.colorHex }} />}
                    <span className="font-medium">{v.name}: {v.value}</span>
                    <span className="text-muted-foreground">{v.priceDeltaCents ? `${v.priceDeltaCents > 0 ? "+" : ""}${formatBRL(v.priceDeltaCents)}` : "sem acréscimo"}</span>
                    <span className={`font-medium ${v.stockQty <= 0 ? "text-muted-foreground" : ""}`}>· {v.stockQty} un.</span>
                    {v.material && <span className="text-muted-foreground">· {v.material.name}</span>}
                    <form action={deleteVariantAction} className="ml-auto">
                      <input type="hidden" name="id" value={v.id} />
                      <Button type="submit" variant="ghost" size="icon" aria-label="Remover"><Trash2 className="text-muted-foreground" /></Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addVariantAction} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="productId" value={product.id} />
              <Input name="name" placeholder="Cor" defaultValue={product.variants[0]?.name ?? "Cor"} required />
              <Input name="value" placeholder="Preto" required />
              <Input name="colorHex" type="color" defaultValue="#222222" className="p-1" />
              <Input name="priceDelta" placeholder="+ R$ 0,00" />
              <Input name="stockQty" type="number" placeholder="Estoque" defaultValue={0} />
              <Select name="materialId" defaultValue="">
                <option value="">Filamento da variação</option>
                {mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
              <Button type="submit" variant="secondary" className="sm:col-span-2">Adicionar variação</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Insumos por unidade (almoxarifado)</CardTitle>
            <p className="text-sm text-muted-foreground">Embalagem, LED, ímã, parafuso… Baixados do almoxarifado a cada fornada e somados ao custo.</p>
          </CardHeader>
          <CardContent>
            <ProductSuppliesEditor productId={product.id} supplies={supplyList} initial={product.suppliesBom.map((l) => ({ supplyId: l.supplyId, qtyPerUnit: l.qtyPerUnit }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nova fornada para estoque</CardTitle>
            <p className="text-sm text-muted-foreground">Cria um job na fila. Ao concluir, as peças boas entram no estoque e os filamentos da ficha são baixados (com desperdício).</p>
          </CardHeader>
          <CardContent>
            <form action={createStockBatchAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="productId" value={product.id} />
              <div>
                <Label>Quantidade</Label>
                <Input name="quantity" type="number" min={1} defaultValue={product.variants.length ? 5 : 10} required />
              </div>
              {product.variants.length > 0 && (
                <div>
                  <Label>Variação</Label>
                  <Select name="variantId" defaultValue="">
                    <option value="">— sem variação —</option>
                    {product.variants.map((v) => <option key={v.id} value={v.id}>{v.name}: {v.value}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <Label>Máquina</Label>
                <Select name="printerId" defaultValue="">
                  <option value="">—</option>
                  {prs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Input name="priority" type="number" defaultValue={0} />
              </div>
              <div className="sm:col-span-2">
                <Label>Notas</Label>
                <Input name="notes" placeholder="Ex.: usar perfil 0.2mm, 3 paredes" />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Estimativa: {bomG || product.materialGrams} g e {product.printMinutes} min por unidade (ficha técnica).
              </p>
              <Button type="submit" className="sm:col-span-2"><Factory /> Enviar fornada para a fila</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Histórico de produção</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><tr><TH>Data</TH><TH>Fornada</TH><TH className="text-right">Plan.</TH><TH className="text-right">Boas</TH><TH className="text-right">Perdidas</TH><TH className="text-right">Material</TH><TH className="text-right">Desperdício</TH><TH className="text-right">Tempo</TH><TH>Status</TH></tr></THead>
            <TBody>
              {product.printJobs.length === 0 && <EmptyRow colSpan={9}>Nenhuma fornada ainda.</EmptyRow>}
              {product.printJobs.map((j) => (
                <TR key={j.id}>
                  <TD className="text-muted-foreground">{formatDate(j.finishedAt ?? j.createdAt, true)}</TD>
                  <TD><span className="block font-medium">{j.title}</span><span className="text-xs text-muted-foreground">{j.printer?.name ?? "—"}{j.orderId ? " · pedido" : j.addsToStock ? " · estoque" : ""}</span></TD>
                  <TD className="text-right">{j.quantity}</TD>
                  <TD className="text-right">{j.producedQty ?? "—"}</TD>
                  <TD className={`text-right ${j.failedQty ? "text-danger" : ""}`}>{j.failedQty ?? "—"}</TD>
                  <TD className="text-right">{j.actualGrams ?? `~${j.estimatedGrams}`} g</TD>
                  <TD className={`text-right ${j.wasteGrams ? "text-danger" : ""}`}>{j.wasteGrams != null ? `${j.wasteGrams} g` : "—"}</TD>
                  <TD className="text-right">{j.actualMinutes ?? `~${j.estimatedMinutes}`} min</TD>
                  <TD><StatusBadge value={j.status} map={printJobStatusLabels} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
