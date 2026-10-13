"use client";

import { useActionState, useState } from "react";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { Address } from "@/db/schema";
import { formatCep } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import { completeProfileAction, lookupCepAction, saveAddressAction, updateProfileAction, deleteAddressAction, setDefaultAddressAction } from "@/actions/account";
import { deleteAccountAction } from "@/actions/consent";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { maskCep } from "./shipping-calculator";

/** Primeiro acesso via Google: confirma nome, pede WhatsApp (obrigatório) e CPF opcional. */
export function CompleteProfileForm({ user, next }: { user: { name: string | null; email: string | null; phone: string | null }; next: string }) {
  const [state, action] = useActionState(completeProfileAction, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Nome completo"><Input name="name" required defaultValue={user.name ?? ""} autoComplete="name" /></Field>
      <Field label="E-mail"><Input value={user.email ?? ""} readOnly className="bg-muted" /></Field>
      <Field label="WhatsApp" hint="Obrigatório: é por ele que avisamos sobre orçamento, produção e entrega"><Input name="phone" required defaultValue={user.phone ?? ""} placeholder="(19) 99999-9999" autoComplete="tel" inputMode="tel" /></Field>
      <Field label="CPF ou CNPJ (opcional)" hint="Só se quiser nota/declaração em seu nome"><Input name="document" inputMode="numeric" /></Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingText="Salvando…">Concluir cadastro</SubmitButton>
      <a href={next} className="text-center text-sm text-muted-foreground hover:underline">Pular por enquanto</a>
    </form>
  );
}

/** Nome, WhatsApp e documento do cliente. */
export function ProfileForm({ user }: { user: { name: string | null; email: string | null; phone: string | null; document: string | null } }) {
  const [state, action] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome completo" className="sm:col-span-2"><Input name="name" required defaultValue={user.name ?? ""} autoComplete="name" /></Field>
      <Field label="E-mail" hint="Para trocar o e-mail, fale com a gente pela Central de ajuda"><Input value={user.email ?? ""} readOnly className="bg-muted" /></Field>
      <Field label="WhatsApp" hint="Avisos de produção, entrega e orçamentos"><Input name="phone" defaultValue={user.phone ?? ""} placeholder="(19) 99999-9999" autoComplete="tel" inputMode="tel" /></Field>
      <Field label="CPF ou CNPJ (opcional)" hint="Só se quiser nota/declaração em seu nome" className="sm:col-span-2"><Input name="document" defaultValue={user.document ?? ""} inputMode="numeric" /></Field>
      <FormMessage state={state} className="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton pendingText="Salvando…">Salvar dados</SubmitButton></div>
    </form>
  );
}

function AddressForm({ address, onDone }: { address?: Address | null; onDone?: () => void }) {
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveAddressAction>>, fd: FormData) => {
    const r = await saveAddressAction(prev, fd);
    if (r?.ok) onDone?.();
    return r;
  }, null);
  const [zip, setZip] = useState(address ? formatCep(address.zip) : "");
  const [f, setF] = useState({ street: address?.street ?? "", district: address?.district ?? "", city: address?.city ?? "", state: address?.state ?? "" });
  const [looking, setLooking] = useState(false);

  const lookup = async (value: string) => {
    if (value.replace(/\D/g, "").length !== 8) return;
    setLooking(true);
    const a = await lookupCepAction(value);
    setLooking(false);
    if (!a.error) setF((cur) => ({ street: a.street || cur.street, district: a.district || cur.district, city: a.city || cur.city, state: a.state || cur.state }));
  };

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      {address && <input type="hidden" name="id" value={address.id} />}
      <Field label="Apelido" className="sm:col-span-2"><Input name="label" defaultValue={address?.label ?? ""} placeholder="Casa, Trabalho…" /></Field>
      <Field label="Quem recebe" className="sm:col-span-2"><Input name="recipient" defaultValue={address?.recipient ?? ""} /></Field>
      <Field label="Telefone no local" className="sm:col-span-2"><Input name="phone" defaultValue={address?.phone ?? ""} inputMode="tel" /></Field>
      <Field label="CEP" hint={looking ? "Buscando endereço…" : undefined} className="sm:col-span-2">
        <Input name="zip" required value={zip} onChange={(e) => { const v = maskCep(e.target.value); setZip(v); void lookup(v); }} inputMode="numeric" autoComplete="postal-code" />
      </Field>
      <Field label="Rua" className="sm:col-span-4"><Input name="street" required value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} autoComplete="address-line1" /></Field>
      <Field label="Número" className="sm:col-span-2"><Input name="number" required defaultValue={address?.number ?? ""} /></Field>
      <Field label="Complemento" className="sm:col-span-4"><Input name="complement" defaultValue={address?.complement ?? ""} placeholder="apto, bloco…" /></Field>
      <Field label="Bairro" className="sm:col-span-3"><Input name="district" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></Field>
      <Field label="Cidade" className="sm:col-span-2"><Input name="city" required value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
      <Field label="UF" className="sm:col-span-1"><Input name="state" required maxLength={2} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} /></Field>
      <Field label="Ponto de referência" hint="Ajuda na entrega local" className="sm:col-span-6"><Input name="reference" defaultValue={address?.reference ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-6"><input type="checkbox" name="isDefault" defaultChecked={address?.isDefault ?? false} className="accent-primary-strong" /> Usar como endereço principal</label>
      <FormMessage state={state} className="sm:col-span-6" />
      <div className="flex gap-2 sm:col-span-6">
        <SubmitButton pendingText="Salvando…">{address ? "Salvar endereço" : "Adicionar endereço"}</SubmitButton>
        {onDone && <Button variant="ghost" onClick={onDone}>Cancelar</Button>}
      </div>
    </form>
  );
}

/** Lista + cadastro de endereços do cliente (até 10). */
export function AddressBook({ addresses }: { addresses: Address[] }) {
  const [editing, setEditing] = useState<string | null>(null); // "new" | id
  return (
    <div className="space-y-4">
      {addresses.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">Nenhum endereço salvo. Cadastre um para agilizar o checkout e ver o frete já calculado.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {addresses.map((a) => (
          <li key={a.id} className={cn("rounded-2xl border p-4 text-sm", a.isDefault && "border-primary-strong bg-blush/40")}>
            {editing === a.id ? (
              <AddressForm address={a} onDone={() => setEditing(null)} />
            ) : (
              <>
                <p className="flex items-center gap-2 font-semibold"><MapPin className="size-4" /> {a.label}{a.isDefault && <span className="rounded-full bg-powder px-2 py-0.5 text-[11px] font-semibold">principal</span>}</p>
                <p className="mt-1 text-muted-foreground">
                  {a.recipient && <>{a.recipient}<br /></>}
                  {a.street}, {a.number}{a.complement ? ` – ${a.complement}` : ""}<br />
                  {a.district ? `${a.district}, ` : ""}{a.city}/{a.state} · {formatCep(a.zip)}
                  {a.reference && <><br />Ref.: {a.reference}</>}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(a.id)}><Pencil /> Editar</Button>
                  {!a.isDefault && (
                    <form action={setDefaultAddressAction}><input type="hidden" name="id" value={a.id} /><SubmitButton variant="outline" size="sm" pendingText="…"><Star /> Tornar principal</SubmitButton></form>
                  )}
                  <form action={deleteAddressAction}><input type="hidden" name="id" value={a.id} /><SubmitButton variant="ghost" size="sm" pendingText="…"><Trash2 /> Remover</SubmitButton></form>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing === "new" ? (
        <div className="rounded-2xl border p-4"><AddressForm onDone={() => setEditing(null)} /></div>
      ) : (
        addresses.length < 10 && <Button variant="outline" onClick={() => setEditing("new")}><Plus /> Novo endereço</Button>
      )}
    </div>
  );
}

/** Exclusão de conta em autoatendimento (LGPD). */
export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, null);
  return (
    <form action={action} className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
      <p className="text-sm font-semibold text-red-900">Excluir minha conta</p>
      <p className="mt-1 text-xs text-red-900/80">
        Sua conta e dados de contato são apagados na hora. Pedidos e orçamentos ficam guardados de forma <strong>anonimizada</strong> pelo prazo legal (não identificam mais você). Esta ação não pode ser desfeita.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input name="confirm" placeholder="Digite EXCLUIR" className="h-9 w-40" autoComplete="off" />
        <SubmitButton variant="danger" size="sm" pendingText="Excluindo…"><Trash2 /> Excluir definitivamente</SubmitButton>
      </div>
      <FormMessage state={state} className="mt-2" />
    </form>
  );
}
