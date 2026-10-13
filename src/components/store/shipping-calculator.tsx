"use client";

import { useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { describeDays, formatCep, type ShippingQuote } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import { quoteForCepAction } from "@/actions/shipping";
import { Input } from "@/components/ui/input";

type Props = {
  initialCep?: string | null;
  initialQuote?: ShippingQuote | null;
  /** cotar um produto avulso (página do produto) em vez do carrinho */
  single?: { productId: string; variantId?: string | null; quantity?: number };
  className?: string;
  compact?: boolean;
};

export function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** "Calcular frete" da página do produto e do carrinho: cotação real por CEP. */
export function ShippingCalculator({ initialCep, initialQuote, single, className, compact }: Props) {
  const [cep, setCep] = useState(initialCep ? formatCep(initialCep) : "");
  const [quote, setQuote] = useState<ShippingQuote | null>(initialQuote?.cep ? initialQuote : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setError(null);
    start(async () => {
      const q = await quoteForCepAction(cep, single);
      if (q.error) {
        setError(q.error);
        return;
      }
      setQuote(q);
    });
  };

  const shown = quote?.options.filter((o) => o.method !== "pickup") ?? [];
  const pickup = quote?.options.find((o) => o.method === "pickup");

  return (
    <div className={cn("rounded-2xl border bg-card p-4", className)}>
      <p className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-4" /> Calcular frete e prazo</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Input value={cep} onChange={(e) => setCep(maskCep(e.target.value))} placeholder="Seu CEP" inputMode="numeric" autoComplete="postal-code" className="h-9" aria-label="CEP" />
        <button type="submit" disabled={pending || cep.replace(/\D/g, "").length !== 8} className="h-9 shrink-0 rounded-lg bg-powder px-3 text-sm font-semibold hover:bg-primary-strong disabled:opacity-50">
          {pending ? "…" : "Calcular"}
        </button>
      </form>
      <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-xs text-muted-foreground hover:underline">Não sei meu CEP</a>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {quote && !error && (
        <ul className="mt-3 divide-y text-sm">
          {shown.map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{o.name}{o.carrier && o.method === "correios" ? <span className="text-muted-foreground"> · {o.carrier}</span> : null}</p>
                <p className="text-xs text-muted-foreground">{describeDays(o)}{!compact && ` · ${o.description}`}</p>
              </div>
              <span className={cn("font-semibold", o.priceCents === 0 && "text-emerald-700")}>{o.priceCents === 0 ? "Grátis" : formatBRL(o.priceCents)}</span>
            </li>
          ))}
          {pickup && (
            <li className="flex items-center gap-3 py-2 text-muted-foreground">
              <div className="min-w-0 flex-1"><p className="font-medium text-foreground">{pickup.name}</p><p className="text-xs">{pickup.description}</p></div>
              <span className="font-semibold text-emerald-700">Grátis</span>
            </li>
          )}
          {shown.length === 0 && !pickup && <li className="py-2 text-muted-foreground">Nenhuma opção de entrega para este CEP.</li>}
          {quote.productionDays > 0 && <li className="py-2 text-xs text-muted-foreground">Prazos já incluem ~{quote.productionDays} dia{quote.productionDays === 1 ? "" : "s"} úteis de produção.</li>}
          {quote.warnings.map((w) => <li key={w} className="py-2 text-xs text-amber-700">{w}</li>)}
        </ul>
      )}
    </div>
  );
}
