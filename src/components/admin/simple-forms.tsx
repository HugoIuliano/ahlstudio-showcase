"use client";

import { useActionState, useState } from "react";
import type { Category, Customer, Material, Printer, Quote } from "@/db/schema";
import { CUSTOMER_STAGES, MATERIAL_TYPES, PRINTER_STATUS, QUOTE_STATUS, STOCK_REASONS } from "@/db/schema";
import { customerStageLabels, printerStatusLabels, quoteStatusLabels, stockReasonLabels } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import type { Settings } from "@/lib/settings";
import { saveCategoryAction } from "@/actions/catalog";
import { saveCustomerAction } from "@/actions/crm";
import { addStockMovementAction, saveMaterialAction, savePrinterAction, savePrintJobAction } from "@/actions/erp";
import { adminUpdateQuoteAction } from "@/actions/quotes";
import { saveSettingsAction } from "@/actions/settings";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

// Formulários pequenos do admin (useActionState precisa de client component).

export function CategoryForm({ category }: { category?: Category | null }) {
  const [state, action] = useActionState(saveCategoryAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_2fr_80px_auto]">
      {category && <input type="hidden" name="id" value={category.id} />}
      <Input name="name" placeholder="Nome" required defaultValue={category?.name} />
      <Input name="description" placeholder="Descrição (opcional)" defaultValue={category?.description ?? ""} />
      <Input name="sortOrder" type="number" placeholder="Ordem" defaultValue={category?.sortOrder ?? 0} />
      <SubmitButton variant={category ? "outline" : "default"} pendingText="…">{category ? "Salvar" : "Adicionar"}</SubmitButton>
      <FormMessage state={state} className="sm:col-span-4" />
    </form>
  );
}

export function CustomerForm({ customer }: { customer?: Customer | null }) {
  const [state, action] = useActionState(saveCustomerAction, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <Field label="Nome" className="sm:col-span-2"><Input name="name" required defaultValue={customer?.name} /></Field>
      <Field label="E-mail"><Input name="email" type="email" defaultValue={customer?.email ?? ""} /></Field>
      <Field label="WhatsApp"><Input name="phone" defaultValue={customer?.phone ?? ""} /></Field>
      <Field label="CPF/CNPJ"><Input name="document" defaultValue={customer?.document ?? ""} /></Field>
      <Field label="Instagram"><Input name="instagram" placeholder="@usuario" defaultValue={customer?.instagram ?? ""} /></Field>
      <Field label="Estágio">
        <Select name="stage" defaultValue={customer?.stage ?? "lead"}>
          {CUSTOMER_STAGES.map((s) => <option key={s} value={s}>{customerStageLabels[s].label}</option>)}
        </Select>
      </Field>
      <Field label="Origem"><Input name="source" placeholder="instagram, feira, indicação…" defaultValue={customer?.source ?? ""} /></Field>
      <Field label="Tags" hint="Separe por vírgula" className="sm:col-span-2"><Input name="tags" defaultValue={customer?.tags.join(", ") ?? ""} /></Field>
      <Field label="Notas" className="sm:col-span-2"><Textarea name="notes" defaultValue={customer?.notes ?? ""} /></Field>
      <FormMessage state={state} className="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton pendingText="Salvando…">{customer ? "Salvar" : "Criar cliente"}</SubmitButton></div>
    </form>
  );
}

export function MaterialForm({ material }: { material?: Material | null }) {
  const [state, action] = useActionState(saveMaterialAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      {material && <input type="hidden" name="id" value={material.id} />}
      <Field label="Nome" className="sm:col-span-2"><Input name="name" required placeholder="PLA Preto Voolt" defaultValue={material?.name} /></Field>
      <Field label="Tipo">
        <Select name="type" defaultValue={material?.type ?? "PLA"}>{MATERIAL_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
      </Field>
      <Field label="Marca"><Input name="brand" defaultValue={material?.brand ?? ""} /></Field>
      <Field label="Cor"><Input name="color" defaultValue={material?.color ?? ""} /></Field>
      <Field label="Cor (hex)"><Input name="colorHex" type="color" defaultValue={material?.colorHex ?? "#222222"} className="p-1" /></Field>
      <Field label="Custo por kg (R$)"><Input name="costPerKg" defaultValue={material ? centsToInput(material.costPerKgCents) : ""} placeholder="120,00" /></Field>
      <Field label="Estoque mínimo (g)"><Input name="minStockGrams" type="number" defaultValue={material?.minStockGrams ?? 200} /></Field>
      {material ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={material.active} className="accent-primary-strong" /> Ativo</label>
      ) : (
        <Field label="Estoque inicial (g)"><Input name="initialStockGrams" type="number" defaultValue={1000} /></Field>
      )}
      <Field label="Fornecedor" className="sm:col-span-2"><Input name="supplier" defaultValue={material?.supplier ?? ""} /></Field>
      <div className="self-end"><SubmitButton className="w-full" pendingText="…">{material ? "Salvar" : "Adicionar material"}</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-3" />
    </form>
  );
}

export function StockMovementForm({ materials }: { materials: Material[] }) {
  const [state, action] = useActionState(addStockMovementAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-5">
      <Field label="Material" className="sm:col-span-2">
        <Select name="materialId" required defaultValue="">
          <option value="" disabled>Selecione…</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.stockGrams}g)</option>)}
        </Select>
      </Field>
      <Field label="Motivo">
        <Select name="reason" defaultValue="purchase">{STOCK_REASONS.map((r) => <option key={r} value={r}>{stockReasonLabels[r]}</option>)}</Select>
      </Field>
      <Field label="Gramas" hint="Ajuste aceita negativo"><Input name="deltaGrams" type="number" required placeholder="1000" /></Field>
      <Field label="Custo/kg (compra)"><Input name="unitCost" placeholder="R$" /></Field>
      <Field label="Observação" className="sm:col-span-4"><Input name="note" /></Field>
      <div className="self-end"><SubmitButton className="w-full" pendingText="…">Registrar</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-5" />
    </form>
  );
}

export function PrinterForm({ printer }: { printer?: Printer | null }) {
  const [state, action] = useActionState(savePrinterAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      {printer && <input type="hidden" name="id" value={printer.id} />}
      <Field label="Nome" className="sm:col-span-2"><Input name="name" required placeholder="Ender 3 #1" defaultValue={printer?.name} /></Field>
      <Field label="Modelo"><Input name="model" defaultValue={printer?.model ?? ""} /></Field>
      <Field label="Status">
        <Select name="status" defaultValue={printer?.status ?? "idle"}>{PRINTER_STATUS.map((s) => <option key={s} value={s}>{printerStatusLabels[s].label}</option>)}</Select>
      </Field>
      <Field label="Custo/hora (R$)" hint="energia + desgaste"><Input name="hourlyCost" defaultValue={printer ? centsToInput(printer.hourlyCostCents) : "1,50"} /></Field>
      <Field label="Mesa (mm)"><Input name="bedSize" placeholder="220x220x250" defaultValue={printer?.bedSize ?? ""} /></Field>
      <Field label="Notas" className="sm:col-span-5"><Input name="notes" defaultValue={printer?.notes ?? ""} /></Field>
      <div className="self-end"><SubmitButton className="w-full" pendingText="…">{printer ? "Salvar" : "Adicionar"}</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-6" />
    </form>
  );
}

export function PrintJobForm({ printers, materials, quotes }: { printers: Printer[]; materials: Material[]; quotes: Pick<Quote, "id" | "number" | "title">[] }) {
  const [state, action] = useActionState(savePrintJobAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      <Field label="Título" className="sm:col-span-3"><Input name="title" required placeholder="Ex.: 3x suporte headset PLA preto" /></Field>
      <Field label="Orçamento (opcional)" className="sm:col-span-3">
        <Select name="quoteId" defaultValue="">
          <option value="">—</option>
          {quotes.map((q) => <option key={q.id} value={q.id}>{q.number} · {q.title}</option>)}
        </Select>
      </Field>
      <Field label="Máquina">
        <Select name="printerId" defaultValue="">
          <option value="">—</option>
          {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Material">
        <Select name="materialId" defaultValue="">
          <option value="">—</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Qtd."><Input name="quantity" type="number" min={1} defaultValue={1} /></Field>
      <Field label="Min. impressão"><Input name="estimatedMinutes" type="number" min={0} defaultValue={60} /></Field>
      <Field label="Min. pós-processo"><Input name="laborMinutes" type="number" min={0} defaultValue={10} /></Field>
      <Field label="Gramas"><Input name="estimatedGrams" type="number" min={0} defaultValue={20} /></Field>
      <Field label="Prioridade"><Input name="priority" type="number" defaultValue={0} /></Field>
      <Field label="Prazo alvo"><Input name="dueAt" type="date" /></Field>
      <Field label="Notas" className="sm:col-span-4"><Input name="notes" /></Field>
      <div className="self-end"><SubmitButton className="w-full" pendingText="…">Adicionar à fila</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-6" />
    </form>
  );
}

export function QuoteAdminForm({ quote, materials, suggestion }: { quote: Quote; materials: Material[]; suggestion?: { costCents: number; priceCents: number } | null }) {
  const [state, action] = useActionState(adminUpdateQuoteAction, null);
  const [cost, setCost] = useState(quote.costCents ? centsToInput(quote.costCents) : "");
  const [price, setPrice] = useState(quote.priceCents ? centsToInput(quote.priceCents) : "");
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={quote.id} />
      <Field label="Status" className="sm:col-span-2">
        <Select name="status" defaultValue={quote.status}>{QUOTE_STATUS.map((s) => <option key={s} value={s}>{quoteStatusLabels[s].label}</option>)}</Select>
      </Field>
      <Field label="Material" className="sm:col-span-2">
        <Select name="materialId" defaultValue={quote.materialId ?? ""}>
          <option value="">—</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Gramas estimadas"><Input name="estimatedGrams" type="number" min={0} defaultValue={quote.estimatedGrams ?? ""} /></Field>
      <Field label="Minutos estimados"><Input name="estimatedMinutes" type="number" min={0} defaultValue={quote.estimatedMinutes ?? ""} /></Field>
      <Field label="Custo (R$)"><Input name="costCents" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      <Field label="Preço ao cliente (R$)"><Input name="priceCents" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      {suggestion && (
        <div className="flex gap-2 sm:col-span-2">
          <button type="button" onClick={() => { setCost(centsToInput(suggestion.costCents)); setPrice(centsToInput(suggestion.priceCents)); }} className="flex-1 rounded-lg border bg-custard/60 px-2 py-1.5 text-xs font-medium hover:bg-custard">
            Usar sugestão: custo {centsToInput(suggestion.costCents)} · preço {centsToInput(suggestion.priceCents)}
          </button>
        </div>
      )}
      <Field label="Válido até" className="sm:col-span-2"><Input name="validUntil" type="date" defaultValue={quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : ""} /></Field>
      <Field label="Notas internas" className="sm:col-span-2"><Textarea name="adminNotes" defaultValue={quote.adminNotes ?? ""} /></Field>
      <FormMessage state={state} className="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton className="w-full" pendingText="Salvando…">Salvar orçamento</SubmitButton></div>
    </form>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState(saveSettingsAction, null);
  const money = (k: keyof Settings) => centsToInput(Number(settings[k]));
  return (
    <form action={action} className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Loja</h2>
        <Field label="Nome da loja"><Input name="shop_name" defaultValue={settings.shop_name} /></Field>
        <Field label="Slogan"><Input name="shop_tagline" defaultValue={settings.shop_tagline} /></Field>
        <Field label="WhatsApp" hint="Só dígitos com DDI, ex.: 5511999999999"><Input name="shop_whatsapp" defaultValue={settings.shop_whatsapp} /></Field>
        <Field label="Instagram"><Input name="shop_instagram" defaultValue={settings.shop_instagram} placeholder="@ahlstudio" /></Field>
        <Field label="E-mail de contato"><Input name="shop_email" defaultValue={settings.shop_email} /></Field>
        <Field label="Cidade"><Input name="shop_city" defaultValue={settings.shop_city} /></Field>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Dados legais (Termos, Privacidade, LGPD)</h2>
        <Field label="Razão social / nome do titular" hint="Aparece nos Termos e na Política"><Input name="shop_legal_name" defaultValue={settings.shop_legal_name} /></Field>
        <Field label="CNPJ ou CPF"><Input name="shop_cnpj" defaultValue={settings.shop_cnpj} /></Field>
        <Field label="Endereço completo" className="sm:col-span-2"><Input name="shop_address" defaultValue={settings.shop_address} /></Field>
        <Field label="E-mail do Encarregado (DPO)" hint="LGPD art. 41; pode ser o e-mail de contato"><Input name="dpo_email" defaultValue={settings.dpo_email} /></Field>
        <Field label="UF (foro)"><Input name="shop_state" defaultValue={settings.shop_state} maxLength={2} /></Field>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">PIX manual</h2>
        <Field label="Chave PIX" hint="Aparece na confirmação do pedido quando o Mercado Pago não está configurado"><Input name="pix_key" defaultValue={settings.pix_key} /></Field>
        <Field label="Titular"><Input name="pix_holder" defaultValue={settings.pix_holder} /></Field>
      </section>
      <section className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Frete</h3>
        Retirada, zonas de entrega local e cotação real de Correios/transportadoras ficam em <a href="/admin/frete" className="font-medium text-foreground underline">Frete e entrega</a>.
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">Financeiro e forecast</h2>
        <Field label="Taxa cartão / Mercado Pago (%)"><Input name="fee_card_pct" defaultValue={settings.fee_card_pct} /></Field>
        <Field label="Taxa PIX (%)"><Input name="fee_pix_pct" defaultValue={settings.fee_pix_pct} /></Field>
        <Field label="Impostos sobre receita (%)" hint="Simples/DAS aproximado"><Input name="tax_pct" defaultValue={settings.tax_pct} /></Field>
        <Field label="Prob. orçamento enviado virar venda" hint="0.5 = 50%"><Input name="prob_quoted" defaultValue={settings.prob_quoted} /></Field>
        <Field label="Prob. pedido pendente ser pago" hint="0.7 = 70%"><Input name="prob_pending_payment" defaultValue={settings.prob_pending_payment} /></Field>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">Calculadora de preço</h2>
        <Field label="Mão de obra por hora (R$)"><Input name="pricing_labor_hourly_cents" defaultValue={money("pricing_labor_hourly_cents")} /></Field>
        <Field label="Taxa de refugo" hint="0.10 = 10%"><Input name="pricing_failure_rate" defaultValue={settings.pricing_failure_rate} /></Field>
        <Field label="Margem sobre o custo" hint="0.80 = 80%"><Input name="pricing_margin_pct" defaultValue={settings.pricing_margin_pct} /></Field>
      </section>
      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">Salvar configurações</SubmitButton>
    </form>
  );
}
