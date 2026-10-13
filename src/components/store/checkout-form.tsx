"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { MapPin, Truck } from "lucide-react";
import type { Address } from "@/db/schema";
import { formatBRL } from "@/lib/money";
import { describeDays, formatCep, type ShippingOption, type ShippingQuote } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import { lookupCepAction } from "@/actions/account";
import { placeOrderAction } from "@/actions/checkout";
import { quoteForCepAction } from "@/actions/shipping";
import { Field, Input, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TermsCheckbox } from "./auth-forms";
import { maskCep } from "./shipping-calculator";

type Props = {
  subtotalCents: number;
  initialQuote: ShippingQuote;
  initialOptionId: string | null;
  addresses: Address[];
  defaults: { name?: string | null; email?: string | null; phone?: string | null };
  paymentLabel: string;
  lockEmail?: boolean;
  loggedIn: boolean;
};

type AddrFields = { street: string; number: string; complement: string; district: string; city: string; state: string; reference: string };
const emptyAddr: AddrFields = { street: "", number: "", complement: "", district: "", city: "", state: "", reference: "" };

export function CheckoutForm({ subtotalCents, initialQuote, initialOptionId, addresses, defaults, paymentLabel, lockEmail, loggedIn }: Props) {
  const [state, action] = useActionState(placeOrderAction, null);
  const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  const [cep, setCep] = useState(initialQuote.cep ? formatCep(initialQuote.cep) : defaultAddr ? formatCep(defaultAddr.zip) : "");
  const [quote, setQuote] = useState<ShippingQuote>(initialQuote);
  const [optionId, setOptionId] = useState<string | null>(initialOptionId && initialQuote.options.some((o) => o.id === initialOptionId) ? initialOptionId : initialQuote.options[0]?.id ?? null);
  const [addressId, setAddressId] = useState<string>(defaultAddr?.id ?? "new");
  const [addr, setAddr] = useState<AddrFields>(emptyAddr);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = useMemo(() => quote.options.find((o) => o.id === optionId) ?? null, [quote, optionId]);
  const needsAddress = !!selected && selected.method !== "pickup";
  const total = subtotalCents + (selected?.priceCents ?? 0);
  const cepDigits = cep.replace(/\D/g, "");

  const requote = (cepValue: string) => {
    setQuoteError(null);
    start(async () => {
      const q = await quoteForCepAction(cepValue);
      if (q.error) {
        setQuoteError(q.error);
        return;
      }
      setQuote(q);
      setOptionId((cur) => (cur && q.options.some((o) => o.id === cur) ? cur : q.options.find((o) => o.method !== "pickup")?.id ?? q.options[0]?.id ?? null));
      // pré-preenche rua/bairro/cidade quando o cliente vai digitar um endereço novo
      if (addressId === "new") {
        const a = await lookupCepAction(cepValue);
        if (!a.error) setAddr((cur) => ({ ...cur, street: a.street ?? cur.street, district: a.district ?? cur.district, city: a.city ?? cur.city, state: a.state ?? cur.state }));
      }
    });
  };

  const pickAddress = (id: string) => {
    setAddressId(id);
    const a = addresses.find((x) => x.id === id);
    if (a && a.zip !== quote.cep) {
      setCep(formatCep(a.zip));
      requote(a.zip);
    }
  };

  const savedAddress = addresses.find((a) => a.id === addressId) ?? null;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="shippingOptionId" value={optionId ?? ""} />
      <input type="hidden" name="zip" value={quote.cep ?? ""} />

      <section className="space-y-4">
        <h2 className="font-semibold">Seus dados</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo" className="sm:col-span-2"><Input name="name" required defaultValue={defaults.name ?? ""} autoComplete="name" /></Field>
          <Field label="E-mail" hint={lockEmail ? "Itens personalizados são vinculados ao e-mail da sua conta" : undefined}>
            <Input name="email" type="email" required defaultValue={defaults.email ?? ""} readOnly={lockEmail} className={lockEmail ? "bg-muted" : undefined} autoComplete="email" />
          </Field>
          <Field label="WhatsApp" hint="Usamos para avisar sobre produção e entrega"><Input name="phone" required placeholder="(19) 99999-9999" defaultValue={defaults.phone ?? ""} autoComplete="tel" inputMode="tel" /></Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold"><Truck className="size-4" /> Entrega</h2>

        <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-muted/40 p-3">
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">CEP de entrega</label>
            <Input value={cep} onChange={(e) => setCep(maskCep(e.target.value))} placeholder="00000-000" inputMode="numeric" autoComplete="postal-code" className="h-10" aria-label="CEP" />
          </div>
          <button type="button" onClick={() => requote(cepDigits)} disabled={pending || cepDigits.length !== 8} className="h-10 rounded-lg bg-powder px-4 text-sm font-semibold hover:bg-primary-strong disabled:opacity-50">
            {pending ? "Calculando…" : quote.cep ? "Recalcular" : "Calcular frete"}
          </button>
          {quoteError && <p className="w-full text-xs text-danger">{quoteError}</p>}
          {!quote.cep && !quoteError && <p className="w-full text-xs text-muted-foreground">Informe o CEP para ver entrega local, Correios e transportadoras com preço e prazo reais. Retirada no studio não precisa de CEP.</p>}
        </div>

        <div className="grid gap-2">
          {quote.options.map((o: ShippingOption) => (
            <label key={o.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-sm", optionId === o.id && "border-primary-strong ring-2 ring-primary/30")}>
              <input type="radio" name="shippingOptionUi" value={o.id} checked={optionId === o.id} onChange={() => setOptionId(o.id)} className="accent-primary-strong" />
              <span className="flex-1">
                <span className="font-medium">{o.name}{o.method === "correios" && o.carrier ? <span className="font-normal text-muted-foreground"> · {o.carrier}</span> : null}</span>
                <span className="block text-muted-foreground">{describeDays(o)} · {o.description}</span>
              </span>
              <span className={cn("font-medium", o.priceCents === 0 && "text-emerald-700")}>{o.priceCents === 0 ? "Grátis" : formatBRL(o.priceCents)}</span>
            </label>
          ))}
          {quote.warnings.map((w) => <p key={w} className="text-xs text-amber-700">{w}</p>)}
        </div>

        {needsAddress && (
          <div className="space-y-3 rounded-2xl border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4" /> Endereço de entrega</p>
            {addresses.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {addresses.map((a) => (
                  <label key={a.id} className={cn("cursor-pointer rounded-xl border p-3 text-sm", addressId === a.id && "border-primary-strong ring-2 ring-primary/30")}>
                    <input type="radio" name="addressUi" checked={addressId === a.id} onChange={() => pickAddress(a.id)} className="mr-2 accent-primary-strong" />
                    <span className="font-medium">{a.label}</span>
                    <span className="block text-muted-foreground">{a.street}, {a.number}{a.complement ? ` – ${a.complement}` : ""} · {a.city}/{a.state} · {formatCep(a.zip)}</span>
                  </label>
                ))}
                <label className={cn("cursor-pointer rounded-xl border p-3 text-sm", addressId === "new" && "border-primary-strong ring-2 ring-primary/30")}>
                  <input type="radio" name="addressUi" checked={addressId === "new"} onChange={() => setAddressId("new")} className="mr-2 accent-primary-strong" />
                  <span className="font-medium">Outro endereço</span>
                  <span className="block text-muted-foreground">Entregar no CEP {quote.cep ? formatCep(quote.cep) : "informado acima"}</span>
                </label>
              </div>
            )}

            {savedAddress ? (
              <input type="hidden" name="addressId" value={savedAddress.id} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-6">
                <Field label="Rua" className="sm:col-span-4"><Input name="street" required value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} autoComplete="address-line1" /></Field>
                <Field label="Número" className="sm:col-span-2"><Input name="number" required value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} /></Field>
                <Field label="Complemento" className="sm:col-span-3"><Input name="complement" value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} autoComplete="address-line2" placeholder="apto, bloco…" /></Field>
                <Field label="Bairro" className="sm:col-span-3"><Input name="district" value={addr.district} onChange={(e) => setAddr({ ...addr, district: e.target.value })} /></Field>
                <Field label="Cidade" className="sm:col-span-4"><Input name="city" required value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} autoComplete="address-level2" /></Field>
                <Field label="UF" className="sm:col-span-2"><Input name="state" required maxLength={2} placeholder="SP" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} autoComplete="address-level1" /></Field>
                {selected?.method === "delivery" && (
                  <Field label="Ponto de referência" hint="Ajuda na entrega local" className="sm:col-span-6"><Input name="reference" value={addr.reference} onChange={(e) => setAddr({ ...addr, reference: e.target.value })} placeholder="Ex.: portão azul, em frente à padaria" /></Field>
                )}
                {loggedIn && (
                  <label className="flex items-center gap-2 text-sm sm:col-span-6">
                    <input type="checkbox" name="saveAddress" className="accent-primary-strong" defaultChecked /> Salvar este endereço na minha conta
                    <Input name="addressLabel" placeholder="Casa" className="h-8 w-32" />
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Observações</h2>
        <Textarea name="notes" placeholder="Alguma instrução especial para o pedido?" className="min-h-20" />
      </section>

      <section className="rounded-2xl border bg-card p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatBRL(subtotalCents)}</span></div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted-foreground">Frete{selected ? ` · ${selected.name}` : ""}</span>
          <span>{selected ? (selected.priceCents ? formatBRL(selected.priceCents) : "Grátis") : "—"}</span>
        </div>
        {selected && <p className="mt-1 text-right text-xs text-muted-foreground">{quote.productionDays > 0 ? `produção ~${quote.productionDays} dia${quote.productionDays === 1 ? "" : "s"} úteis · ` : "pronta entrega · "}{describeDays(selected)}</p>}
        <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{formatBRL(total)}</span></div>
        <p className="mt-2 text-xs text-muted-foreground">Pagamento: {paymentLabel}</p>
      </section>

      <TermsCheckbox />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingText="Criando pedido…" disabled={!selected || pending}>Confirmar pedido · {formatBRL(total)}</SubmitButton>
    </form>
  );
}
