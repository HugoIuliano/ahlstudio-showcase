import { desc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth";
import { permissionsOf, ROLE_LABELS } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { UserRoleForm } from "@/components/admin/user-role-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function UsersPage() {
  const session = await requirePagePermission("users.manage");
  const list = await db.query.users.findMany({ orderBy: desc(users.createdAt), columns: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true, passwordHash: true, image: true } });
  const staff = list.filter((u) => u.role !== "customer");
  const customersList = list.filter((u) => u.role === "customer");

  return (
    <div className="space-y-6">
      <PageHeader title="Usuários e acessos" description="RBAC: quem pode fazer o quê no painel. Clientes nunca acessam o backoffice." />

      <Card>
        <CardHeader><CardTitle>Papéis e permissões</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-xs sm:grid-cols-3">
          {(["support", "production", "admin"] as const).map((r) => (
            <div key={r} className="rounded-xl border p-3">
              <p className="mb-1 font-semibold">{ROLE_LABELS[r]}</p>
              <p className="text-muted-foreground">{permissionsOf(r).join(" · ")}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Equipe ({staff.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><tr><TH>Usuário</TH><TH>Login</TH><TH>Último acesso</TH><TH>Acesso</TH></tr></THead>
            <TBody>
              {staff.map((u) => (
                <TR key={u.id}>
                  <TD><span className="block font-medium">{u.name ?? "—"}{u.id === session.user.id ? " (você)" : ""}</span><span className="text-xs text-muted-foreground">{u.email}</span></TD>
                  <TD className="text-muted-foreground">{u.passwordHash ? "senha" : "Google"}</TD>
                  <TD className="text-muted-foreground">{formatDate(u.lastLoginAt, true)}</TD>
                  <TD><UserRoleForm user={{ id: u.id, role: u.role, active: u.active }} self={u.id === session.user.id} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Clientes com conta ({customersList.length})</CardTitle><p className="text-sm text-muted-foreground">Para dar acesso ao painel a alguém, a pessoa cria a conta no site e você troca o papel aqui.</p></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><tr><TH>Usuário</TH><TH>Desde</TH><TH>Último acesso</TH><TH>Acesso</TH></tr></THead>
            <TBody>
              {customersList.length === 0 && <EmptyRow colSpan={4}>Nenhum cliente cadastrado.</EmptyRow>}
              {customersList.map((u) => (
                <TR key={u.id}>
                  <TD><span className="block font-medium">{u.name ?? "—"}</span><span className="text-xs text-muted-foreground">{u.email}</span></TD>
                  <TD className="text-muted-foreground">{formatDate(u.createdAt)}</TD>
                  <TD className="text-muted-foreground">{formatDate(u.lastLoginAt, true)}</TD>
                  <TD><UserRoleForm user={{ id: u.id, role: u.role, active: u.active }} self={false} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
