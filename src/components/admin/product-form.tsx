"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Category, Material, Product, ProductImage, ProductMaterial } from "@/db/schema";
import { PRODUCT_STATUS } from "@/db/schema";
import { Sparkles } from "lucide-react";
import { productStatusLabels } from "@/lib/labels";
import { centsToInput, formatBRL, parseBRLToCents } from "@/lib/money";
import { bomGrams, estimateProductionDays, unitCost, type BomLine } from "@/lib/production";
import { mediaToLine } from "@/lib/media";
import { KNOWN_TAGS } from "@/lib/tags";
import { saveProductAction } from "@/actions/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = {
  product?: (Product & { images: ProductImage[]; bom: ProductMaterial[] }) | null;
  categories: Category[];
  materials: Material[];
  pricing: { laborHourlyCents: number; failureRate: number; marginPct: number; printerHourlyCents: number };
  /** capacidade de produção (de /admin/frete) para estimar o prazo */
  lead: { hoursPerDay: number; machines: number; laborHoursPerDay: number; handlingDays: number };
};

export function ProductForm({ product, categories, materials, pricing, lead }: Props) {
  const [state, action] = useActionState(saveProductAction, null);
  const [bom, setBom] = useState<BomLine[]>(
    product?.bom.length
      ? product.bom.map((l) => ({ materialId: l.materialId, gramsPerUnit: l.gramsPerUnit, note: l.note }))
      : [{ materialId: materials[0]?.id ?? "", gramsPerUnit: product?.materialGrams ?? 0, note: "" }],
  );
  const [kind, setKind] = useState<"stock" | "custom">(product?.kind ?? "stock");
  const [minutes, setMinutes] = useState(product?.printMinutes ?? 0);
  const [labor, setLabor] = useState(product?.laborMinutes ?? 10);
  const [price, setPrice] = useState(product ? centsToInput(product.priceCents) : "");
  const [cost, setCost] = useState(product ? centsToInput(product.costCents) : "");

  const breakdown = useMemo(
    () =>
      unitCost({
        bom,
        materials,
        printMinutes: minutes,
        printerHourlyCents: pricing.printerHourlyCents,
        laborMinutes: labor,
        laborHourlyCents: pricing.laborHourlyCents,
        failureRate: pricing.failureRate,
        marginPct: pricing.marginPct,
      }),
    [bom, materials, minutes, labor, pricing],
  );
  const priceCents = parseBRLToCents(price);
  const costCents = parseBRLToCents(cost);
  const margin = priceCents > 0 && costCents > 0 ? Math.round(((priceCents - costCents) / priceCents) * 100) : null;
  const totalGrams = bomGrams(bom);

  const updateLine = (i: number, patch: Partial<BomLine>) => setBom((b) => b.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="bom" value={JSON.stringify(bom)} />

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Informações</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2"><Input name="name" required defaultValue={product?.name} /></Field>
            <Field label="Slug (URL)" hint="Deixe vazio para gerar do nome"><Input name="slug" defaultValue={product?.slug} /></Field>
            <Field label="SKU / código"><Input name="sku" defaultValue={product?.sku ?? ""} /></Field>
            <Field label="Categoria">
              <Select name="categoryId" defaultValue={product?.categoryId ?? ""}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={product?.status ?? "draft"}>
                {PRODUCT_STATUS.map((s) => <option key={s} value={s}>{productStatusLabels[s].label}</option>)}
              </Select>
            </Field>
            <Field label="Tipo do item" hint={kind === "custom" ? 'Aparece no catálogo com "a partir de" e gera um orçamento pré-preenchido em vez de ir ao carrinho.' : "Compra direta pelo carrinho."} className="sm:col-span-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {([["stock", "Produto de catálogo", "Preço fechado, estoque e carrinho"], ["custom", "Personalizado sob orçamento", "Cliente descreve a versão dele; você precifica"]] as const).map(([v, t, h]) => (
                  <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${kind === v ? "border-primary-strong ring-2 ring-primary/30" : ""}`}>
                    <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="mt-0.5 accent-primary-strong" />
                    <span><span className="block font-medium">{v === "custom" && <Sparkles className="mr-1 inline size-3.5" />}{t}</span><span className="text-muted-foreground">{h}</span></span>
                  </label>
                ))}
              </div>
            </Field>
            {kind === "custom" && (
              <Field label="Roteiro do orçamento" hint="Perguntas que o cliente deve responder. Pré-preenche a descrição do pedido de orçamento." className="sm:col-span-2">
                <Textarea name="quoteBrief" defaultValue={product?.quoteBrief ?? ""} className="min-h-24" placeholder={"Ex.: Nome/frase a gravar:\nCor principal:\nQuantidade:\nData de entrega desejada:"} />
              </Field>
            )}
            <Field label="Descrição" className="sm:col-span-2"><Textarea name="description" defaultValue={product?.description ?? ""} className="min-h-32" /></Field>
            <Field label="Tags" hint={`Separe por vírgula. Conhecidas: ${Object.keys(KNOWN_TAGS).join(", ")}`} className="sm:col-span-2">
              <Input name="tags" defaultValue={product?.tags.join(", ") ?? ""} placeholder="destaques, novidades" />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={product?.featured} className="accent-primary-strong" /> Destacar na home (fallback da tag destaques)</label>
          </CardContent>
        </Card>

        {/* ===== FICHA TÉCNICA (ERP) ===== */}
        <Card>
          <CardHeader>
            <CardTitle>Ficha técnica · produção por unidade</CardTitle>
            <p className="text-sm text-muted-foreground">Quais filamentos e quantas gramas cada peça consome, e o tempo de impressão. É daqui que sai o custo e a baixa de estoque.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_110px_1fr_36px] gap-2 text-xs font-medium text-muted-foreground"><span>Filamento</span><span>Gramas/un.</span><span>Uso (opcional)</span><span /></div>
              {bom.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_110px_1fr_36px] gap-2">
                  <Select value={l.materialId} onChange={(e) => updateLine(i, { materialId: e.target.value })}>
                    <option value="">Selecione…</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name} · {formatBRL(m.costPerKgCents)}/kg · {m.stockGrams}g</option>)}
                  </Select>
                  <Input type="number" min={0} value={l.gramsPerUnit} onChange={(e) => updateLine(i, { gramsPerUnit: Number(e.target.value) || 0 })} />
                  <Input value={l.note ?? ""} onChange={(e) => updateLine(i, { note: e.target.value })} placeholder="corpo, detalhe, suporte…" />
                  <button type="button" onClick={() => setBom((b) => b.filter((_, idx) => idx !== i))} className="grid place-items-center rounded-lg border hover:bg-muted" aria-label="Remover"><Trash2 className="size-4 text-muted-foreground" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setBom((b) => [...b, { materialId: materials[0]?.id ?? "", gramsPerUnit: 0, note: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm hover:bg-muted">
                <Plus className="size-4" /> Adicionar filamento
              </button>
              {materials.length === 0 && <p className="text-xs text-danger">Cadastre materiais em Estoque antes de montar a ficha técnica.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tempo de impressão (min/un.)"><Input name="printMinutes" type="number" min={0} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} /></Field>
              <Field label="Pós-processo (min/un.)" hint="lixar, montar, embalar — entra no custo e no prazo"><Input name="laborMinutes" type="number" min={0} value={labor} onChange={(e) => setLabor(Number(e.target.value) || 0)} /></Field>
              <Field label="Total de material" hint="soma da ficha"><Input readOnly value={`${totalGrams} g`} className="bg-muted" /></Field>
            </div>

            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-sm font-medium">Embalagem para frete</p>
              <p className="mb-3 text-xs text-muted-foreground">Usado na cotação real dos Correios/transportadoras. Deixe 0 para usar o padrão de <em>Frete e entrega</em>; o peso vazio usa as gramas da ficha + embalagem.</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Peso embalado (g)"><Input name="weightGrams" type="number" min={0} defaultValue={product?.weightGrams ?? 0} /></Field>
                <Field label="Comprimento (cm)"><Input name="lengthCm" type="number" min={0} max={105} defaultValue={product?.lengthCm ?? 0} /></Field>
                <Field label="Largura (cm)"><Input name="widthCm" type="number" min={0} max={105} defaultValue={product?.widthCm ?? 0} /></Field>
                <Field label="Altura (cm)"><Input name="heightCm" type="number" min={0} max={105} defaultValue={product?.heightCm ?? 0} /></Field>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fotos e vídeos</CardTitle>
            <p className="text-sm text-muted-foreground">Galeria vertical estilo Instagram (9:16). Use fotos/vídeos em pé. A primeira mídia é a capa do card.</p>
          </CardHeader>
          <CardContent>
            <Field label="URLs (uma por linha)" hint="Vídeo (.mp4/.webm) é detectado pela extensão. Capa opcional do vídeo: url_do_video | url_da_capa">
              <Textarea name="images" defaultValue={product?.images.map(mediaToLine).join("\n") ?? ""} className="min-h-28 font-mono text-xs" placeholder={"https://…/foto1.jpg\nhttps://…/video.mp4 | https://…/capa.jpg"} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Personalização</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isCustomizable" defaultChecked={product?.isCustomizable} className="accent-primary-strong" /> Cliente pode enviar texto de personalização no carrinho</label>
            <Field label="Dica para o cliente"><Input name="customizationHint" defaultValue={product?.customizationHint ?? ""} placeholder="Ex.: informe o nome a gravar (até 12 letras)" /></Field>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {/* ===== CUSTO ===== */}
        <Card className="border-powder bg-blush/60">
          <CardHeader><CardTitle>Custo de produção (por unidade)</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-[1fr_auto] gap-y-1">
              <dt className="text-muted-foreground">Material ({totalGrams} g)</dt><dd className="text-right">{formatBRL(breakdown.materialCents)}</dd>
              <dt className="text-muted-foreground">Máquina ({minutes} min × {formatBRL(pricing.printerHourlyCents)}/h)</dt><dd className="text-right">{formatBRL(breakdown.machineCents)}</dd>
              <dt className="text-muted-foreground">Mão de obra ({labor} min)</dt><dd className="text-right">{formatBRL(breakdown.laborCents)}</dd>
              <dt className="text-muted-foreground">Refugo ({Math.round(pricing.failureRate * 100)}%)</dt><dd className="text-right">{formatBRL(breakdown.failureCents)}</dd>
              <dt className="border-t pt-1 font-semibold">Custo</dt><dd className="border-t pt-1 text-right font-semibold">{formatBRL(breakdown.costCents)}</dd>
              <dt className="font-semibold">Preço sugerido (+{Math.round(pricing.marginPct * 100)}%)</dt><dd className="text-right font-semibold">{formatBRL(breakdown.suggestedPriceCents)}</dd>
            </dl>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCost(centsToInput(breakdown.costCents))} className="flex-1 rounded-lg border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted">Usar custo calculado</button>
              <button type="button" onClick={() => setPrice(centsToInput(breakdown.suggestedPriceCents))} className="flex-1 rounded-lg border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted">Usar preço sugerido</button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Preço e estoque</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Custo unitário registrado (R$)" hint={margin != null ? `Margem sobre o preço: ${margin}%` : "Usado no financeiro"}>
              <Input name="cost" value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
            <Field label={kind === "custom" ? 'Preço base "a partir de" (R$)' : "Preço de venda (R$)"}><Input name="price" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="49,90" /></Field>
            <Field label="Preço 'de' (R$)" hint="Para mostrar desconto"><Input name="compareAtPrice" defaultValue={product?.compareAtPriceCents ? centsToInput(product.compareAtPriceCents) : ""} /></Field>
            <Field label={kind === "custom" ? "Estoque (não se aplica)" : "Estoque pronto (un.)"} hint={product ? "Reposto automaticamente pelas fornadas concluídas" : "0 = impresso sob demanda"}>
              <Input name="stockQty" type="number" defaultValue={product?.stockQty ?? 0} />
            </Field>
            {kind === "stock" && (
              <Field label="Estoque saudável (un.)" hint="A fila sugere fornadas quando o estoque cai abaixo disso. 0 = calcular pela velocidade de venda.">
                <Input name="targetStockQty" type="number" min={0} defaultValue={product?.targetStockQty ?? 0} />
              </Field>
            )}
          </CardContent>
        </Card>

        {/* ===== INDICADORES ===== */}
        <Card>
          <CardHeader><CardTitle>Indicadores</CardTitle></CardHeader>
          <CardContent>
            {(() => {
              const profit = priceCents - costCents;
              const marginPct = priceCents > 0 ? (profit / priceCents) * 100 : 0;
              const markup = costCents > 0 ? priceCents / costCents : 0;
              const hours = (minutes + labor) / 60;
              const profitPerHour = hours > 0 ? profit / hours : 0;
              const tone = marginPct < 30 ? "text-danger" : marginPct < 50 ? "text-amber-600" : "text-emerald-700";
              const leadDays = estimateProductionDays([{ printMinutes: minutes, laborMinutes: labor, quantity: 1, inStock: false }], lead);
              const lead10 = estimateProductionDays([{ printMinutes: minutes, laborMinutes: labor, quantity: 10, inStock: false }], lead);
              const items = [
                ["Lucro por unidade", formatBRL(profit), tone],
                ["Margem sobre o preço", `${marginPct.toFixed(0)}%`, tone],
                ["Markup", markup ? `${markup.toFixed(2)}×` : "—", ""],
                ["Lucro por hora de máquina", formatBRL(profitPerHour), profitPerHour < 1500 ? "text-amber-600" : "text-emerald-700"],
                ["Tempo total por unidade", `${minutes + labor} min`, ""],
                ["Lucro em fornada de 10", formatBRL(profit * 10), ""],
                ["Prazo sob encomenda (1 un.)", `${leadDays} dia${leadDays === 1 ? "" : "s"} úteis`, ""],
                ["Prazo sob encomenda (10 un.)", `${lead10} dia${lead10 === 1 ? "" : "s"} úteis`, ""],
              ] as const;
              return (
                <>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {items.map(([k, v, c]) => (
                    <div key={k} className="rounded-xl bg-muted p-3">
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className={`text-lg font-semibold ${c}`}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">Prazo = impressão ÷ ({lead.hoursPerDay} h × {lead.machines} máq./dia) + pós-processo ÷ {lead.laborHoursPerDay} h/dia + {lead.handlingDays} dia(s) de embalagem/postagem. Capacidade e embalagem em <a href="/admin/frete" className="underline">Frete e entrega</a>; em estoque só conta a embalagem.</p>
                </>
              );
            })()}
            <p className="mt-2 text-xs text-muted-foreground">Referência: margem abaixo de 30% em vermelho, abaixo de 50% em amarelo. Lucro/hora considera impressão + pós-processo.</p>
          </CardContent>
        </Card>

        <FormMessage state={state} />
        <SubmitButton className="w-full" pendingText="Salvando…">{product ? "Salvar alterações" : "Criar produto"}</SubmitButton>
      </div>
    </form>
  );
}
