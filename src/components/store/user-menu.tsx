"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, LifeBuoy, LogOut, Package, Settings2, ShieldCheck, UserRound } from "lucide-react";
import { logoutAction } from "@/actions/auth";

type Props = { name?: string | null; email?: string | null; roleLabel: string; isStaff: boolean };

/** Dropdown do ícone da conta (desktop). Mostra "Painel" só para papéis de equipe. */
export function UserMenu({ name, email, roleLabel, isStaff }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const first = name?.split(" ")[0] ?? "Conta";
  const item = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted";

  return (
    <div ref={ref} className="relative hidden md:block">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card pl-2 pr-3 text-sm font-medium hover:bg-muted">
        <span className="grid size-6 place-items-center rounded-full bg-powder text-xs font-bold">{first[0]?.toUpperCase()}</span>
        {first}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 animate-fade-up rounded-2xl border bg-card p-2 shadow-xl">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{name ?? email}</p>
            <p className="truncate text-xs text-muted-foreground">{email} · {roleLabel}</p>
          </div>
          <div className="my-1 border-t" />
          {isStaff && (
            <>
              <Link href="/admin" role="menuitem" onClick={() => setOpen(false)} className={`${item} bg-canary/70 font-semibold hover:bg-canary`}><ShieldCheck className="size-4" /> Painel administrativo</Link>
              <div className="my-1 border-t" />
            </>
          )}
          <Link href="/conta" role="menuitem" onClick={() => setOpen(false)} className={item}><UserRound className="size-4" /> Minha conta</Link>
          <Link href="/conta#pedidos" role="menuitem" onClick={() => setOpen(false)} className={item}><Package className="size-4" /> Meus pedidos</Link>
          <Link href="/conta#orcamentos" role="menuitem" onClick={() => setOpen(false)} className={item}><FileText className="size-4" /> Meus orçamentos</Link>
          <Link href="/ajuda" role="menuitem" onClick={() => setOpen(false)} className={item}><LifeBuoy className="size-4" /> Ajuda e chamados</Link>
          <Link href="/conta#seguranca" role="menuitem" onClick={() => setOpen(false)} className={item}><Settings2 className="size-4" /> Segurança e dados</Link>
          <div className="my-1 border-t" />
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className={`${item} w-full text-left text-danger`}><LogOut className="size-4" /> Sair</button>
          </form>
        </div>
      )}
    </div>
  );
}
