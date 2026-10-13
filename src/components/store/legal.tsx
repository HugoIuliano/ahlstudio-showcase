import Link from "next/link";
import type { Settings } from "@/lib/settings";

/** Dados do controlador usados nos documentos legais (preenchidos em /admin/configuracoes). */
export function legalParty(s: Settings) {
  return {
    name: s.shop_legal_name || `${s.shop_name} (razão social a informar)`,
    doc: s.shop_cnpj || "CNPJ/CPF a informar",
    address: s.shop_address || "endereço a informar",
    email: s.shop_email || "e-mail de contato a informar",
    dpo: s.dpo_email || s.shop_email || "e-mail do encarregado a informar",
    city: s.shop_city || "a informar",
    state: s.shop_state || "SP",
    brand: s.shop_name,
  };
}

export function LegalLayout({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8 border-b pb-6">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Versão {version}. <Link href="/privacidade" className="underline">Política de Privacidade</Link> · <Link href="/termos" className="underline">Termos de Uso</Link></p>
      </header>
      <div className="space-y-6 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_p]:text-foreground/90 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left">
        {children}
      </div>
    </article>
  );
}
