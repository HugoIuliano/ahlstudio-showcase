"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles, X } from "lucide-react";

type Props = { loggedIn: boolean; isAdmin: boolean; userName?: string | null };

/** Menu hambúrguer da loja (só < md). */
export function MobileNav({ loggedIn, isAdmin, userName }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Início" },
    { href: "/produtos", label: "Catálogo" },
    { href: "/projetos", label: "Personalizados", accent: true },
    { href: "/carrinho", label: "Carrinho" },
    { href: "/ajuda", label: "Ajuda e chamados" },
    loggedIn ? { href: "/conta", label: userName ? `Conta · ${userName}` : "Minha conta" } : { href: "/login", label: "Entrar / criar conta" },
    ...(isAdmin ? [{ href: "/admin", label: "Painel administrativo", accent: true }] : []),
  ];
  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} className="grid size-9 place-items-center rounded-lg hover:bg-muted">
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <div className="fixed inset-x-0 top-16 z-50 border-b bg-background/95 p-3 shadow-lg backdrop-blur animate-fade-up">
          <ul className="grid gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-3 text-base font-medium ${"accent" in l && l.accent ? "bg-canary text-accent-foreground" : pathname === l.href ? "bg-rose/60" : "hover:bg-muted"}`}
                >
                  {"accent" in l && l.accent && <Sparkles className="size-4" />}
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
