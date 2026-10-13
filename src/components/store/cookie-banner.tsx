"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";
import { cookieConsentAction } from "@/actions/consent";
import { Button } from "@/components/ui/button";

/** Banner LGPD de cookies. Só aparece enquanto não há escolha registrada (cookie ahl_consent). */
export function CookieBanner() {
  return (
    <div role="dialog" aria-label="Aviso de cookies" className="fixed bottom-3 left-3 right-3 z-50 mx-auto w-auto max-w-3xl animate-fade-up rounded-2xl border bg-card p-4 shadow-xl md:bottom-6 md:left-6 md:right-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Cookie className="hidden size-6 shrink-0 text-primary-strong md:block" />
        <p className="flex-1 text-sm text-muted-foreground">
          Usamos cookies <strong className="text-foreground">essenciais</strong> para login e carrinho, e, com o seu consentimento, cookies de
          <strong className="text-foreground"> análise</strong> para melhorar a loja. Saiba mais na{" "}
          <Link href="/privacidade" className="underline">Política de Privacidade</Link>.
        </p>
        <div className="flex gap-2">
          <form action={cookieConsentAction}>
            <input type="hidden" name="choice" value="essential" />
            <Button type="submit" variant="outline" size="sm">Somente essenciais</Button>
          </form>
          <form action={cookieConsentAction}>
            <input type="hidden" name="choice" value="all" />
            <Button type="submit" size="sm">Aceitar todos</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
