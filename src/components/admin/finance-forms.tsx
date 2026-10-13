"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Asset, Expense, Printer, Supply } from "@/db/schema";
import { ASSET_CATEGORIES, EXPENSE_CATEGORIES, EXPENSE_KINDS, REVENUE_LINES, SUPPLY_CATEGORIES, SUPPLY_REASONS, SUPPLY_UNITS } from "@/db/schema";
import { assetCategoryLabels, DEFAULT_EXPENSE_KIND, expenseCategoryLabels, expenseKindLabels, revenueLineLabels, supplyCategoryLabels, supplyReasonLabels } from "@/lib/labels";
import { centsToInput, formatBRL } from "@/lib/money";
import { addManualRevenueAction, addSupplyMovementAction, saveAssetAction, saveExpenseAction, saveProductSuppliesAction, saveSupplyAction } from "@/actions/finance";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

const today = () => new Date().toISOString().slice(0, 10);
const dateInput = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function ExpenseForm({ expense }: { expense?: Expense | null }) {
  const [state, action] = useActionState(saveExpenseAction, null);
  const [category, setCategory] = useState(expense?.category ?? "cloud");
  const [recurring, setRecurring] = useState(expense?.recurring ?? false);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      {expense && <input type="hidden" name="id" value={expense.id} />}
      <Field label="Descrição" className="sm:col-span-3"><Input name="description" required defaultValue={expense?.description} placeholder="Ex.: Turso + Cloud Run" /></Field>
      <Field label="Categoria">
        <Select name="category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{expenseCategoryLabels[c]}</option>)}
        </Select>
      </Field>
      <Field label="Tipo" hint="padrão pela categoria">
        <Select name="kind" defaultValue={expense?.kind ?? DEFAULT_EXPENSE_KIND[category]} key={category + (expense?.id ?? "")}>
          {EXPENSE_KINDS.map((k) => <option key={k} value={k}>{expenseKindLabels[k]}</option>)}
        </Select>
      </Field>
      <Field label="Valor (R$)"><Input name="amount" required defaultValue={expense ? centsToInput(expense.amountCents) : ""} placeholder="0,00" /></Field>
      <Field label={recurring ? "Início (1º mês)" : "Data"}><Input name="date" type="date" defaultValue={dateInput(expense?.date) || today()} /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2"><input type="checkbox" name="recurring" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="accent-primary-strong" /> Recorrente mensal (cloud, aluguel, software…)</label>
      {recurring && <Field label="Fim (opcional)"><Input name="endDate" type="date" defaultValue={dateInput(expense?.endDate)} /></Field>}
      <Field label="Fornecedor" className={recurring ? "sm:col-span-2" : "sm:col-span-3"}><Input name="supplier" defaultValue={expense?.supplier ?? ""} /></Field>
      <Field label="Observação" className="sm:col-span-5"><Input name="note" defaultValue={expense?.note ?? ""} /></Field>
      <div className="self-end"><SubmitButton className="w-full" pendingText="…">{expense ? "Salvar" : "Lançar"}</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-6" />
    </form>
  );
}

export function AssetForm({ asset, printers }: { asset?: Asset | null; printers: Printer[] }) {
  const [state, action] = useActionState(saveAssetAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      {asset && <input type="hidden" name="id" value={asset.id} />}
      <Field label="Ativo" className="sm:col-span-2"><Input name="name" required defaultValue={asset?.name} placeholder="Ex.: Bambu A1 mini" /></Field>
      <Field label="Categoria">
        <Select name="category" defaultValue={asset?.category ?? "machine"}>{ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{assetCategoryLabels[c]}</option>)}</Select>
      </Field>
      <Field label="Valor (R$)"><Input name="amount" required defaultValue={asset ? centsToInput(asset.amountCents) : ""} /></Field>
      <Field label="Compra"><Input name="purchaseDate" type="date" required defaultValue={dateInput(asset?.purchaseDate) || today()} /></Field>
      <Field label="Vida útil (meses)" hint="máquina 36 · PC 48"><Input name="usefulLifeMonths" type="number" min={1} defaultValue={asset?.usefulLifeMonths ?? 36} /></Field>
      <Field label="Valor residual (R$)"><Input name="salvage" defaultValue={asset ? centsToInput(asset.salvageCents) : "0,00"} /></Field>
      <Field label="Máquina vinculada" className="sm:col-span-2">
        <Select name="printerId" defaultValue={asset?.printerId ?? ""}>
          <option value="">—</option>
          {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Observação" className="sm:col-span-2"><Input name="note" defaultValue={asset?.note ?? ""} /></Field>
      <div className="self-end"><SubmitButton className="w-full" pendingText="…">{asset ? "Salvar" : "Registrar CAPEX"}</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-6" />
    </form>
  );
}

export function ManualRevenueForm() {
  const [state, action] = useActionState(addManualRevenueAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      <Field label="Descrição" className="sm:col-span-2"><Input name="description" required placeholder="Ex.: Feira de artesanato — 12 peças" /></Field>
      <Field label="Linha de receita">
        <Select name="line" defaultValue="event">{REVENUE_LINES.map((l) => <option key={l} value={l}>{revenueLineLabels[l]}</option>)}</Select>
      </Field>
      <Field label="Receita (R$)"><Input name="amount" required /></Field>
      <Field label="Custo (R$)"><Input name="cost" defaultValue="0,00" /></Field>
      <Field label="Data"><Input name="date" type="date" defaultValue={today()} /></Field>
      <div className="sm:col-span-6"><SubmitButton pendingText="…">Lançar receita</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-6" />
    </form>
  );
}

export function SupplyForm({ supply }: { supply?: Supply | null }) {
  const [state, action] = useActionState(saveSupplyAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      {supply && <input type="hidden" name="id" value={supply.id} />}
      <Field label="Insumo" className="sm:col-span-2"><Input name="name" required defaultValue={supply?.name} placeholder="Ex.: Caixa 16x11x6" /></Field>
      <Field label="Categoria">
        <Select name="category" defaultValue={supply?.category ?? "packaging"}>{SUPPLY_CATEGORIES.map((c) => <option key={c} value={c}>{supplyCategoryLabels[c]}</option>)}</Select>
      </Field>
      <Field label="Unidade"><Select name="unit" defaultValue={supply?.unit ?? "un"}>{SUPPLY_UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
      <Field label="Custo unitário (R$)"><Input name="unitCost" defaultValue={supply ? centsToInput(supply.unitCostCents) : ""} /></Field>
      <Field label="Mínimo"><Input name="minQty" type="number" step="any" defaultValue={supply?.minQty ?? 0} /></Field>
      {supply ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={supply.active} className="accent-primary-strong" /> Ativo</label>
      ) : (
        <Field label="Qtd. inicial"><Input name="initialQty" type="number" step="any" defaultValue={0} /></Field>
      )}
      <Field label="SKU"><Input name="sku" defaultValue={supply?.sku ?? ""} /></Field>
      <Field label="Local"><Input name="location" defaultValue={supply?.location ?? ""} placeholder="Prateleira B2" /></Field>
      <Field label="Fornecedor" className="sm:col-span-2"><Input name="supplier" defaultValue={supply?.supplier ?? ""} /></Field>
      <div className="self-end"><SubmitButton className="w-full" pendingText="…">{supply ? "Salvar" : "Adicionar insumo"}</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-6" />
    </form>
  );
}

export function SupplyMovementForm({ supplies }: { supplies: Supply[] }) {
  const [state, action] = useActionState(addSupplyMovementAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-5">
      <Field label="Insumo" className="sm:col-span-2">
        <Select name="supplyId" required defaultValue="">
          <option value="" disabled>Selecione…</option>
          {supplies.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.qty} {s.unit})</option>)}
        </Select>
      </Field>
      <Field label="Motivo"><Select name="reason" defaultValue="purchase">{SUPPLY_REASONS.map((r) => <option key={r} value={r}>{supplyReasonLabels[r]}</option>)}</Select></Field>
      <Field label="Quantidade" hint="ajuste aceita negativo"><Input name="delta" type="number" step="any" required /></Field>
      <Field label="Custo unit. (compra)"><Input name="unitCost" placeholder="R$" /></Field>
      <Field label="Observação" className="sm:col-span-4"><Input name="note" /></Field>
      <div className="self-end"><SubmitButton className="w-full" pendingText="…">Registrar</SubmitButton></div>
      <FormMessage state={state} className="sm:col-span-5" />
    </form>
  );
}

/** Editor de insumos por unidade do produto (salva JSON via action). */
export function ProductSuppliesEditor({ productId, supplies, initial }: { productId: string; supplies: Supply[]; initial: { supplyId: string; qtyPerUnit: number }[] }) {
  const [lines, setLines] = useState(initial.length ? initial : []);
  const cost = lines.reduce((a, l) => a + (supplies.find((s) => s.id === l.supplyId)?.unitCostCents ?? 0) * l.qtyPerUnit, 0);
  return (
    <form action={saveProductSuppliesAction} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_100px_36px] gap-2">
          <Select value={l.supplyId} onChange={(e) => setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, supplyId: e.target.value } : x)))}>
            <option value="">Selecione…</option>
            {supplies.map((s) => <option key={s.id} value={s.id}>{s.name} · {formatBRL(s.unitCostCents)}/{s.unit} · {s.qty} em estoque</option>)}
          </Select>
          <Input type="number" step="any" min={0} value={l.qtyPerUnit} onChange={(e) => setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, qtyPerUnit: Number(e.target.value) || 0 } : x)))} />
          <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="grid place-items-center rounded-lg border hover:bg-muted" aria-label="Remover"><Trash2 className="size-4 text-muted-foreground" /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setLines((ls) => [...ls, { supplyId: supplies[0]?.id ?? "", qtyPerUnit: 1 }])} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm hover:bg-muted"><Plus className="size-4" /> Adicionar insumo</button>
        <span className="text-sm text-muted-foreground">Custo de insumos por unidade: <strong className="text-foreground">{formatBRL(Math.round(cost))}</strong></span>
        <Button type="submit" variant="secondary" size="sm">Salvar insumos</Button>
      </div>
      {supplies.length === 0 && <p className="text-xs text-muted-foreground">Cadastre insumos em Almoxarifado primeiro.</p>}
    </form>
  );
}
