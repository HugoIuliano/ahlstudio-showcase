"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changePasswordAction, googleSignInAction, loginAction, signupAction } from "@/actions/auth";
import { PASSWORD_RULES } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

function GoogleButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <form action={googleSignInAction}>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit" variant="outline" className="w-full">
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12S6.6 21.7 12 21.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"/></svg>
        Continuar com Google
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Ao continuar com o Google você aceita os <Link href="/termos" target="_blank" className="underline">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank" className="underline">Política de Privacidade</Link>.</p>
    </form>
  );
}

export function TermsCheckbox({ name = "acceptTerms" }: { name?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} required className="mt-1 accent-primary-strong" />
      <span>
        Li e aceito os <Link href="/termos" target="_blank" className="underline">Termos de Uso</Link> e a{" "}
        <Link href="/privacidade" target="_blank" className="underline">Política de Privacidade</Link>, e autorizo o tratamento dos meus dados para esta finalidade (LGPD).
      </span>
    </label>
  );
}

export function LoginForm({ callbackUrl, googleEnabled }: { callbackUrl: string; googleEnabled: boolean }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Field label="E-mail"><Input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Senha"><Input name="password" type="password" required autoComplete="current-password" /></Field>
        <FormMessage state={state} />
        <SubmitButton className="w-full" pendingText="Entrando…">Entrar</SubmitButton>
      </form>
      {googleEnabled && (
        <>
          <div className="relative text-center text-xs text-muted-foreground"><span className="bg-card px-2">ou</span><hr className="absolute inset-x-0 top-1/2 -z-10" /></div>
          <GoogleButton callbackUrl={callbackUrl} />
        </>
      )}
      <p className="text-center text-sm text-muted-foreground">
        Não tem conta? <Link href="/cadastro" className="text-primary-strong hover:underline">Cadastre-se</Link>
      </p>
    </div>
  );
}

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, action] = useActionState(signupAction, null);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <Field label="Nome"><Input name="name" required autoComplete="name" /></Field>
        <Field label="E-mail"><Input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="WhatsApp" hint="Opcional, para avisos do pedido"><Input name="phone" autoComplete="tel" /></Field>
        <Field label="Senha" hint={PASSWORD_RULES}><Input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
        <TermsCheckbox />
        <FormMessage state={state} />
        <SubmitButton className="w-full" pendingText="Criando conta…">Criar conta</SubmitButton>
      </form>
      {googleEnabled && (
        <>
          <div className="relative text-center text-xs text-muted-foreground"><span className="bg-card px-2">ou</span><hr className="absolute inset-x-0 top-1/2 -z-10" /></div>
          <GoogleButton callbackUrl="/conta" />
          <p className="text-center text-xs text-muted-foreground">Ao continuar com Google você também aceita os Termos e a Política.</p>
        </>
      )}
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta? <Link href="/login" className="text-primary-strong hover:underline">Entrar</Link>
      </p>
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <Field label="Senha atual"><Input name="current" type="password" required autoComplete="current-password" /></Field>
      <Field label="Nova senha" hint={PASSWORD_RULES}><Input name="password" type="password" required minLength={10} autoComplete="new-password" /></Field>
      <Field label="Confirmar nova senha"><Input name="confirm" type="password" required autoComplete="new-password" /></Field>
      <FormMessage state={state} className="sm:col-span-3" />
      <div className="sm:col-span-3"><SubmitButton variant="secondary" pendingText="Salvando…">Alterar senha</SubmitButton></div>
    </form>
  );
}
