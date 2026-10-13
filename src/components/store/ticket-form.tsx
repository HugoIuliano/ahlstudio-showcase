"use client";

import { useActionState } from "react";
import { TICKET_CATEGORIES } from "@/db/schema";
import { ticketCategoryLabels } from "@/lib/labels";
import { openTicketAction } from "@/actions/tickets";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { TermsCheckbox } from "./auth-forms";
import { FileInput } from "./attachments";

type Props = {
  defaults: { name?: string | null; email?: string | null };
  orders: { id: string; number: string }[];
  quotes: { id: string; number: string; title: string }[];
  preset?: { category?: string; orderId?: string; quoteId?: string; subject?: string };
};

export function TicketForm({ defaults, orders, quotes, preset }: Props) {
  const [state, action] = useActionState(openTicketAction, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Seu nome"><Input name="name" required defaultValue={defaults.name ?? ""} autoComplete="name" /></Field>
        <Field label="E-mail" hint="Usaremos para responder e para você acompanhar o chamado"><Input name="email" type="email" required defaultValue={defaults.email ?? ""} autoComplete="email" /></Field>
        <Field label="Assunto" className="sm:col-span-2"><Input name="subject" required defaultValue={preset?.subject ?? ""} placeholder="Ex.: Meu pedido chegou com uma peça quebrada" /></Field>
        <Field label="Categoria">
          <Select name="category" defaultValue={preset?.category ?? "other"}>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{ticketCategoryLabels[c]}</option>)}</Select>
        </Field>
        {orders.length > 0 ? (
          <Field label="Pedido relacionado">
            <Select name="orderId" defaultValue={preset?.orderId ?? ""}>
              <option value="">—</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}
            </Select>
          </Field>
        ) : preset?.orderId ? <input type="hidden" name="orderId" value={preset.orderId} /> : null}
        {quotes.length > 0 ? (
          <Field label="Orçamento relacionado">
            <Select name="quoteId" defaultValue={preset?.quoteId ?? ""}>
              <option value="">—</option>
              {quotes.map((q) => <option key={q.id} value={q.id}>{q.number} · {q.title}</option>)}
            </Select>
          </Field>
        ) : preset?.quoteId ? <input type="hidden" name="quoteId" value={preset.quoteId} /> : null}
      </div>
      <Field label="Descreva o que aconteceu"><Textarea name="body" required className="min-h-32" /></Field>
      <FileInput hint="Fotos, vídeos ou arquivos ajudam a resolver mais rápido (até 4 × 5 MB)" />
      <TermsCheckbox />
      <FormMessage state={state} />
      <SubmitButton size="lg" pendingText="Abrindo chamado…">Abrir chamado</SubmitButton>
    </form>
  );
}
