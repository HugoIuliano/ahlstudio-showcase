"use client";

import { useActionState, useState } from "react";
import { requestQuoteAction } from "@/actions/quotes";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { MATERIAL_TYPES } from "@/db/schema";
import { cn } from "@/lib/utils";
import { TermsCheckbox } from "./auth-forms";
import { FileInput } from "./attachments";

export type QuotePrefill = {
  productId?: string;
  productName?: string;
  title?: string;
  description?: string;
  quantity?: number;
  desiredMaterial?: string;
  desiredColor?: string;
  dimensions?: string;
};

const PROJECT_TYPES = [
  { value: "idea", label: "Tenho uma ideia / referência", hint: "Descreva e mande fotos ou links; a gente modela." },
  { value: "file", label: "Já tenho o arquivo 3D", hint: "STL/3MF/OBJ por link (Drive, Printables, Thingiverse…)." },
  { value: "replacement", label: "Peça de reposição", hint: "Algo que quebrou ou não existe mais; medidas ajudam muito." },
  { value: "gift", label: "Presente / lembrancinha", hint: "Nome, data, quantidade e ocasião." },
];

const USES = ["Decorativo", "Funcional (precisa aguentar esforço)", "Uso externo (sol/chuva)", "Contato com alimentos", "Brinquedo / infantil"];
const FINISHES = ["Padrão (camadas visíveis)", "Lixado", "Pintado", "Multicolorido"];

/**
 * Coleta estruturada para o admin chegar no preço rápido:
 * tipo de projeto, uso, acabamento, medidas, quantidade, material, cor, prazo, referências.
 */
export function QuoteForm({ defaults, prefill }: { defaults: { name?: string | null; email?: string | null; phone?: string | null }; prefill?: QuotePrefill }) {
  const [state, action] = useActionState(requestQuoteAction, null);
  const [type, setType] = useState(prefill?.productId ? "gift" : "idea");
  const [uses, setUses] = useState<string[]>([]);
  const [finish, setFinish] = useState(FINISHES[0]);

  // resumo estruturado vai junto na descrição para o admin ver tudo num lugar
  const structured = [
    `Tipo: ${PROJECT_TYPES.find((t) => t.value === type)?.label}`,
    uses.length ? `Uso: ${uses.join(", ")}` : null,
    `Acabamento: ${finish}`,
  ].filter(Boolean).join(" · ");

  return (
    <form action={action} className="space-y-7">
      {prefill?.productId && <input type="hidden" name="productId" value={prefill.productId} />}
      <input type="hidden" name="structured" value={structured} />

      {prefill?.productName && (
        <div className="rounded-2xl bg-custard/60 p-4 text-sm">
          <p className="font-semibold">Orçamento para: {prefill.productName}</p>
          <p className="text-muted-foreground">Já pré-preenchemos o que dá. Complete com os detalhes da sua versão.</p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">1. O que você precisa?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROJECT_TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => setType(t.value)} className={cn("rounded-2xl border bg-card p-3 text-left text-sm transition-colors hover:bg-muted", type === t.value && "border-primary-strong ring-2 ring-primary/30")}>
              <span className="block font-medium">{t.label}</span>
              <span className="text-muted-foreground">{t.hint}</span>
            </button>
          ))}
        </div>
        <Field label="Título do projeto" hint="Ex.: Suporte de parede para headset"><Input name="title" required defaultValue={prefill?.title ?? ""} /></Field>
        <Field label="Descreva com detalhes" hint="Para que serve, onde vai ser usado, encaixes, texto a gravar…">
          <Textarea name="description" required className="min-h-32" defaultValue={prefill?.description ?? ""} />
        </Field>
        <Field label="Anexar fotos, desenhos ou arquivo 3D">
          <FileInput />
        </Field>
        <Field label="Ou links de referência" hint="Drive, Printables, Thingiverse… Um por linha.">
          <Textarea name="referenceLinks" className="min-h-16" placeholder="https://" />
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">2. Como vai ser usado?</h2>
        <div className="flex flex-wrap gap-2">
          {USES.map((u) => {
            const on = uses.includes(u);
            return (
              <button key={u} type="button" onClick={() => setUses((s) => (on ? s.filter((x) => x !== u) : [...s, u]))} className={cn("rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted", on && "border-primary-strong bg-rose")}>
                {u}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Quantidade"><Input name="quantity" type="number" min={1} defaultValue={prefill?.quantity ?? 1} /></Field>
          <Field label="Material">
            <Select name="desiredMaterial" defaultValue={prefill?.desiredMaterial ?? ""}>
              <option value="">Me indique</option>
              {MATERIAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Cor"><Input name="desiredColor" placeholder="Preto, branco…" defaultValue={prefill?.desiredColor ?? ""} /></Field>
          <Field label="Medidas aprox. (mm)"><Input name="dimensions" placeholder="100 x 50 x 20" defaultValue={prefill?.dimensions ?? ""} /></Field>
        </div>
        <Field label="Acabamento">
          <div className="flex flex-wrap gap-2">
            {FINISHES.map((f) => (
              <button key={f} type="button" onClick={() => setFinish(f)} className={cn("rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted", finish === f && "border-primary-strong bg-rose")}>{f}</button>
            ))}
          </div>
        </Field>
        <Field label="Prazo desejado" hint="Opcional"><Input name="deadline" placeholder="Ex.: até 20/10, para um aniversário" /></Field>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">3. Seus contatos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Seu nome" className="sm:col-span-2"><Input name="name" required defaultValue={defaults.name ?? ""} autoComplete="name" /></Field>
          <Field label="E-mail"><Input name="email" type="email" required defaultValue={defaults.email ?? ""} autoComplete="email" /></Field>
          <Field label="WhatsApp"><Input name="phone" required placeholder="(11) 99999-9999" defaultValue={defaults.phone ?? ""} autoComplete="tel" /></Field>
        </div>
      </section>

      <TermsCheckbox />
      <FormMessage state={state} />
      <SubmitButton size="lg" pendingText="Enviando…">Enviar pedido de orçamento</SubmitButton>
    </form>
  );
}
