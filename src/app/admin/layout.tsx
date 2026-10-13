import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, printJobs, quotes, tickets } from "@/db/schema";
import { auth, getStaffSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/actions/auth";
import { AdminSidebar } from "@/components/admin/sidebar";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const jwt = await auth();
  if (!jwt?.user) redirect("/login?callbackUrl=/admin");
  // papel confirmado no banco a cada request: rebaixar/bloquear tem efeito imediato
  const session = await getStaffSession();
  if (!session) redirect("/conta");

  const [s, [pendingOrders], [newQuotes], [queued], [openTickets]] = await Promise.all([
    getSettings(),
    db.select({ n: count() }).from(orders).where(eq(orders.status, "paid")),
    db.select({ n: count() }).from(quotes).where(eq(quotes.status, "new")),
    db.select({ n: count() }).from(printJobs).where(eq(printJobs.status, "queued")),
    db.select({ n: count() }).from(tickets).where(eq(tickets.status, "open")),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <AdminSidebar
        role={session.user.role}
        shopName={s.shop_name}
        badges={{ "/admin/pedidos": pendingOrders.n, "/admin/orcamentos": newQuotes.n, "/admin/producao": queued.n, "/admin/chamados": openTickets.n }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden h-16 items-center justify-end gap-3 border-b bg-card/60 px-6 text-sm md:flex">
          <span className="text-muted-foreground">{session.user.name ?? session.user.email} · {ROLE_LABELS[session.user.role]}</span>
          <form action={logoutAction}><Button variant="outline" size="sm">Sair</Button></form>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
