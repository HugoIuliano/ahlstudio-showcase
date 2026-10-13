"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type LucideIcon,
  ClipboardList,
  Factory,
  FileText,
  BarChart3,
  Boxes,
  TrendingUp,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  Package,
  Printer,
  ScrollText,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  Truck,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { UserRole } from "@/db/schema";
import { can, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; permission: Permission };
const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Geral",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, permission: "dashboard.view" }],
  },
  {
    label: "Loja",
    items: [
      { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag, permission: "orders.view" },
      { href: "/admin/produtos", label: "Produtos", icon: Package, permission: "products.view" },
      { href: "/admin/categorias", label: "Categorias", icon: Tags, permission: "products.manage" },
      { href: "/admin/frete", label: "Frete e entrega", icon: Truck, permission: "settings.manage" },
    ],
  },
  {
    label: "Atendimento / CRM",
    items: [
      { href: "/admin/chamados", label: "Chamados", icon: LifeBuoy, permission: "tickets.view" },
      { href: "/admin/orcamentos", label: "Orçamentos", icon: FileText, permission: "quotes.view" },
      { href: "/admin/clientes", label: "Clientes", icon: Users, permission: "customers.view" },
    ],
  },
  {
    label: "Studio / ERP",
    items: [
      { href: "/admin/producao", label: "Fila de produção", icon: ClipboardList, permission: "production.view" },
      { href: "/admin/estoque", label: "Filamentos & estoque", icon: Factory, permission: "stock.view" },
      { href: "/admin/almoxarifado", label: "Almoxarifado", icon: Boxes, permission: "stock.view" },
      { href: "/admin/maquinas", label: "Máquinas do studio", icon: Printer, permission: "machines.manage" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/admin/financeiro", label: "Financeiro (DRE)", icon: Wallet, permission: "finance.view" },
      { href: "/admin/forecast", label: "Forecast", icon: TrendingUp, permission: "finance.view" },
      { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3, permission: "finance.view" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/usuarios", label: "Usuários e acessos", icon: UserCog, permission: "users.manage" },
      { href: "/admin/auditoria", label: "Auditoria e logs", icon: ScrollText, permission: "audit.view" },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings, permission: "settings.manage" },
    ],
  },
];

export function AdminSidebar({ shopName, role, badges }: { shopName: string; role: UserRole; badges: Record<string, number> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = groups.map((g) => ({ ...g, items: g.items.filter((i) => can(role, i.permission)) })).filter((g) => g.items.length);

  return (
    <>
      {/* barra superior mobile */}
      <div className="flex h-14 items-center gap-3 border-b bg-card px-4 md:hidden">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Menu" className="grid size-9 place-items-center rounded-lg hover:bg-muted">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <Link href="/admin" className="font-semibold">{shopName} · Painel</Link>
      </div>
      {open && <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-foreground/30 md:hidden" />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r bg-card transition-transform md:static md:z-auto md:w-60 md:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <Link href="/admin" className="flex h-16 items-center gap-2 border-b px-5 font-semibold">
          <Image src="/brand/logo-icon.png" alt="" width={32} height={32} className="size-8 object-contain" />
          <span className="truncate">{shopName}</span>
        </Link>
        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {visible.map((g) => (
            <div key={g.label}>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                  const badge = badges[item.href];
                  return (
                    <li key={item.href}>
                      <Link href={item.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted", active && "bg-rose/60 font-medium")}>
                        <item.icon className="size-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {badge ? <span className="rounded-full bg-canary px-1.5 text-[11px] font-semibold text-accent-foreground">{badge}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <Store className="size-4" /> Ver loja
          </Link>
        </div>
      </aside>
    </>
  );
}
