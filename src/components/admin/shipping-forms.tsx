"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import type { ShippingZone } from "@/db/schema";
import { centsToInput, formatBRL } from "@/lib/money";
import type { Settings } from "@/lib/settings";
import { describeDays, formatCep, type ShippingQuote } from "@/lib/shipping";
import { PROVIDER_LABELS, SERVICE_CODES } from "@/lib/shipping-providers";
import { cn } from "@/lib/utils";
import { deleteZoneAction, saveShippingSettingsAction, saveZoneAction, seedDefaultZonesAction, testQuoteAction } from "@/actions/shipping";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

const cepInt = (n: number) => formatCep(String(n).padStart(8, "0"));

export function ShippingSettingsForm({ settings, providerReady }: { settings: Settings; providerReady: boolean }) {
  const [state, action] = useActionState(saveShippingSettingsAction, null);
  const [provider, setProvider] = useState(settings.shipping_provider);
  const money = (k: keyof Settings) => centsToInput(Number(settings[k]) || 0);
  return (
    <form action={action} className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <h3 className="text-sm font-semibold sm:col-span-3">Canais de entrega</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shipping_pickup_enabled" defaultChecked={settings.shipping_pickup_enabled === "true"} className="accent-primary-strong" /> Retirada no studio</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shipping_delivery_enabled" defaultChecked={settings.shipping_delivery_enabled === "true"} className="accent-primary-strong" /> Entrega local (zonas abaixo)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shipping_correios_enabled" defaultChecked={settings.shipping_correios_enabled === "true"} className="accent-primary-strong" /> Correios / transportadoras</label>
        <Field label="Texto da retirada" hint="Aparece como descrição da opção" className="sm:col-span-3"><Input name="shipping_pickup_note" defaultValue={settings.shipping_pickup_note} placeholder="Seg a sex, 9h–18h — avisamos quando estiver pronto" /></Field>
        <Field label="Frete grátis a partir de (R$)" hint="Vale para entrega local e transportadoras; 0 desativa"><Input name="free_shipping_from_cents" defaultValue={money("free_shipping_from_cents")} /></Field>
        <Field label="Dias úteis de embalagem/postagem" hint="Base do prazo; itens a imprimir somam o tempo de máquina"><Input name="shipping_handling_days" type="number" min={0} defaultValue={settings.shipping_handling_days} /></Field>
        <Field label="Horas de máquina por dia útil" hint="Capacidade usada para estimar a produção"><Input name="production_hours_per_day" type="number" min={1} max={24} defaultValue={settings.production_hours_per_day} /></Field>
        <Field label="Máquinas em paralelo"><Input name="production_parallel_machines" type="number" min={1} max={20} defaultValue={settings.production_parallel_machines} /></Field>
        <Field label="Horas de mão de obra por dia útil" hint="Pós-processamento: lixar, montar, embalar"><Input name="production_labor_hours_per_day" type="number" min={1} max={24} defaultValue={settings.production_labor_hours_per_day} /></Field>
        <Field label="Cobertura de estoque (dias)" hint="Sugestões de fornada miram estoque para N dias de venda"><Input name="production_stock_cover_days" type="number" min={1} max={120} defaultValue={settings.production_stock_cover_days} /></Field>
        <Field label="SLA para responder orçamento (dias úteis)"><Input name="production_quote_sla_days" type="number" min={0} max={30} defaultValue={settings.production_quote_sla_days} /></Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <h3 className="text-sm font-semibold sm:col-span-3">Cotação real — Correios e transportadoras</h3>
        <Field label="Provedor" hint={provider === "none" ? "Sem cotação real: usa o valor fixo" : providerReady ? "Token configurado ✔" : "Falta o token no ambiente (SUPERFRETE_TOKEN / MELHORENVIO_TOKEN)"}>
          <Select name="shipping_provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {Object.entries(PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="CEP de origem (postagem)"><Input name="shipping_origin_cep" defaultValue={formatCep(settings.shipping_origin_cep)} inputMode="numeric" /></Field>
        <Field label="Serviços cotados" hint={`Códigos separados por vírgula. ${SERVICE_CODES.map((s) => `${s.code}=${s.label}`).join(" · ")}`}><Input name="shipping_services" defaultValue={settings.shipping_services} /></Field>
        <Field label="Acréscimo por envio (R$)" hint="Embalagem/manuseio somado à cotação"><Input name="shipping_extra_cents" defaultValue={money("shipping_extra_cents")} /></Field>
        <Field label="Peso da embalagem (g)" hint="Somado às gramas de material de cada peça"><Input name="shipping_pkg_weight_grams" type="number" min={0} defaultValue={settings.shipping_pkg_weight_grams} /></Field>
        <Field label="Caixa padrão C×L×A (cm)" hint="Quando o produto não informa dimensões"><Input name="shipping_pkg_dims_cm" defaultValue={settings.shipping_pkg_dims_cm} placeholder="16x12x6" /></Field>
        <Field label="Valor fixo de fallback (R$)" hint="Usado se o provedor estiver desligado ou fora do ar; 0 esconde a opção"><Input name="shipping_correios_cents" defaultValue={money("shipping_correios_cents")} /></Field>
      </section>

      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">Salvar frete</SubmitButton>
    </form>
  );
}

function ZoneForm({ zone, onDone }: { zone?: ShippingZone | null; onDone?: () => void }) {
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveZoneAction>>, fd: FormData) => {
    const r = await saveZoneAction(prev, fd);
    if (r?.ok && !zone) onDone?.();
    return r;
  }, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <Field label="Nome" className="sm:col-span-3"><Input name="name" required defaultValue={zone?.name ?? ""} placeholder="Zona 1 — Americana" /></Field>
      <Field label="Ordem" hint="menor aparece primeiro"><Input name="sortOrder" type="number" defaultValue={zone?.sortOrder ?? 0} /></Field>
      <Field label="CEP inicial"><Input name="cepStart" required defaultValue={zone ? cepInt(zone.cepStart) : ""} placeholder="13465-000" inputMode="numeric" /></Field>
      <Field label="CEP final"><Input name="cepEnd" required defaultValue={zone ? cepInt(zone.cepEnd) : ""} placeholder="13479-999" inputMode="numeric" /></Field>
      <Field label="Preço (R$)" hint="cobrado do cliente"><Input name="price" defaultValue={zone ? centsToInput(zone.priceCents) : ""} placeholder="8,00" /></Field>
      <Field label="Custo p/ studio (R$)" hint="vai para o COGS"><Input name="cost" defaultValue={zone?.costCents ? centsToInput(zone.costCents) : ""} placeholder="5,00" /></Field>
      <Field label="Grátis a partir de (R$)" hint="0 = nunca"><Input name="freeFrom" defaultValue={zone?.freeFromCents ? centsToInput(zone.freeFromCents) : ""} /></Field>
      <Field label="Prazo mín. (dias úteis)"><Input name="minDays" type="number" min={0} defaultValue={zone?.minDays ?? 1} /></Field>
      <Field label="Prazo máx. (dias úteis)"><Input name="maxDays" type="number" min={0} defaultValue={zone?.maxDays ?? 2} /></Field>
      <Field label="Observação para o cliente" className="sm:col-span-2"><Textarea name="note" defaultValue={zone?.note ?? ""} className="min-h-10" placeholder="Entregas às terças e quintas" /></Field>
      {zone && <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-6"><input type="checkbox" name="active" defaultChecked={zone.active} className="accent-primary-strong" /> Zona ativa</label>}
      <FormMessage state={state} className="sm:col-span-6" />
      <div className="flex gap-2 sm:col-span-6">
        <SubmitButton pendingText="…">{zone ? "Salvar zona" : "Criar zona"}</SubmitButton>
        {onDone && <Button variant="ghost" onClick={onDone}>Cancelar</Button>}
      </div>
    </form>
  );
}

export function ZonesManager({ zones }: { zones: ShippingZone[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {zones.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma zona. Crie as zonas padrão da região de Americana (Americana, Santa Bárbara, Nova Odessa, Sumaré, Hortolândia, Limeira, Paulínia, Cosmópolis) e ajuste preços depois.
          <form action={seedDefaultZonesAction} className="mt-3"><SubmitButton variant="outline" pendingText="Criando…"><Wand2 /> Criar zonas padrão</SubmitButton></form>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2">Zona</th><th className="px-3 py-2">Faixa de CEP</th><th className="px-3 py-2">Preço</th><th className="px-3 py-2">Custo</th><th className="px-3 py-2">Grátis a partir</th><th className="px-3 py-2">Prazo</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {zones.map((z) => (
                <tr key={z.id} className={cn(!z.active && "opacity-50")}>
                  <td className="px-3 py-2 font-medium">{z.name}{!z.active && <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>}{z.note && <p className="text-xs font-normal text-muted-foreground">{z.note}</p>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{cepInt(z.cepStart)} – {cepInt(z.cepEnd)}</td>
                  <td className="px-3 py-2">{formatBRL(z.priceCents)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{z.costCents ? formatBRL(z.costCents) : "—"}</td>
                  <td className="px-3 py-2">{z.freeFromCents ? formatBRL(z.freeFromCents) : "—"}</td>
                  <td className="px-3 py-2">{describeDays({ method: "delivery", daysMin: z.minDays, daysMax: z.maxDays })}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditing(editing === z.id ? null : z.id)}><Pencil /></Button>
                      <form action={deleteZoneAction}><input type="hidden" name="id" value={z.id} /><SubmitButton variant="ghost" size="icon" aria-label="Excluir" pendingText="…"><Trash2 className="text-muted-foreground" /></SubmitButton></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && editing !== "new" && zones.find((z) => z.id === editing) && (
        <div className="rounded-xl border bg-muted/30 p-4"><ZoneForm zone={zones.find((z) => z.id === editing)} onDone={() => setEditing(null)} /></div>
      )}
      {editing === "new" ? (
        <div className="rounded-xl border bg-muted/30 p-4"><ZoneForm onDone={() => setEditing(null)} /></div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing("new")}><Plus /> Nova zona</Button>
          {zones.length > 0 && <form action={seedDefaultZonesAction}><SubmitButton variant="ghost" pendingText="…"><Wand2 /> Completar com as zonas padrão</SubmitButton></form>}
        </div>
      )}
    </div>
  );
}

export function TestQuoteForm() {
  const [state, action] = useActionState(testQuoteAction, null);
  const quote: ShippingQuote | undefined = state?.quote ?? undefined;
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="CEP de destino"><Input name="cep" required placeholder="01310-100" inputMode="numeric" /></Field>
        <Field label="Peso da peça (g)"><Input name="grams" type="number" min={1} defaultValue={150} /></Field>
        <Field label="Valor do pedido (R$)"><Input name="value" defaultValue="50,00" /></Field>
        <Field label="Minutos a imprimir" hint="0 = em estoque"><Input name="printMinutes" type="number" min={0} defaultValue={0} /></Field>
        <Field label="Minutos de pós-processo"><Input name="laborMinutes" type="number" min={0} defaultValue={0} /></Field>
        <div className="self-end"><SubmitButton className="w-full" pendingText="Cotando…">Testar cotação</SubmitButton></div>
      </div>
      <FormMessage state={state} />
      {quote && (
        <ul className="divide-y rounded-xl border text-sm">
          {quote.options.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-24 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[11px] font-medium uppercase">{o.method}</span>
              <span className="flex-1"><span className="font-medium">{o.name}</span>{o.carrier && <span className="text-muted-foreground"> · {o.carrier}</span>}<span className="block text-xs text-muted-foreground">{describeDays(o)} · {o.description}</span></span>
              <span className="font-semibold">{o.priceCents ? formatBRL(o.priceCents) : "Grátis"}</span>
            </li>
          ))}
          {quote.warnings.map((w) => <li key={w} className="px-3 py-2 text-xs text-amber-700">{w}</li>)}
          {quote.zone && <li className="px-3 py-2 text-xs text-muted-foreground">Zona local encontrada: {quote.zone.name}</li>}
          <li className="px-3 py-2 text-xs text-muted-foreground">Prazo de produção estimado: {quote.productionDays} dia(s) útil(eis)</li>
        </ul>
      )}
    </form>
  );
}
