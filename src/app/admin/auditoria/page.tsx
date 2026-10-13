import Link from "next/link";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, AUDIT_CHANNELS, AUDIT_LEVELS, consents, type AuditChannel, type AuditLevel } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { PageHeader, Stat } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const channelLabel: Record<AuditChannel, string> = { customer: "Cliente", backoffice: "Backoffice", system: "Sistema" };
const levelTone = { info: "neutral", warn: "warning", error: "danger" } as const;
const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; channel?: string; level?: string; action?: string; page?: string }> }) {
  await requirePagePermission("audit.view");
  const sp = await searchParams;
  const channel = AUDIT_CHANNELS.includes(sp.channel as AuditChannel) ? (sp.channel as AuditChannel) : null;
  const level = AUDIT_LEVELS.includes(sp.level as AuditLevel) ? (sp.level as AuditLevel) : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();

  const where = and(
    channel ? eq(auditLogs.channel, channel) : undefined,
    level ? eq(auditLogs.level, level) : undefined,
    sp.action ? like(auditLogs.action, `${sp.action}%`) : undefined,
    q ? or(like(auditLogs.summary, `%${q}%`), like(auditLogs.actorEmail, `%${q}%`), like(auditLogs.entityId, `%${q}%`), like(auditLogs.ip, `%${q}%`)) : undefined,
  );

  const dayAgo = new Date(new Date().getTime() - 86400000);
  const [rows, [{ n: total }], [{ n: errors24h }], [{ n: logins24h }], [{ n: failed24h }], dsr] = await Promise.all([
    db.query.auditLogs.findMany({ where, orderBy: desc(auditLogs.createdAt), limit: PAGE, offset: (page - 1) * PAGE }),
    db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(where),
    db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(and(eq(auditLogs.level, "error"), sql`${auditLogs.createdAt} >= ${dayAgo.getTime()}`)),
    db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(and(eq(auditLogs.action, "auth.login"), sql`${auditLogs.createdAt} >= ${dayAgo.getTime()}`)),
    db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(and(eq(auditLogs.action, "auth.login_failed"), sql`${auditLogs.createdAt} >= ${dayAgo.getTime()}`)),
    db.query.consents.findMany({ where: or(eq(consents.type, "deletion_request"), eq(consents.type, "export_request")), orderBy: desc(consents.createdAt), limit: 10 }),
  ]);

  const actions = await db.select({ a: auditLogs.action, n: sql<number>`count(*)` }).from(auditLogs).groupBy(auditLogs.action).orderBy(desc(sql`count(*)`)).limit(40);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/admin/auditoria?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Auditoria e logs" description="Trilha imutável de tudo que acontece: ações de clientes, do backoffice e eventos de sistema (webhooks, falhas)." />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Eventos (filtro)" value={total} />
        <Stat label="Logins 24h" value={logins24h} />
        <Stat label="Logins falhos 24h" value={failed24h} tone={failed24h > 10 ? "danger" : failed24h > 0 ? "warning" : undefined} hint={failed24h > 10 ? "possível força bruta" : undefined} />
        <Stat label="Erros de sistema 24h" value={errors24h} tone={errors24h > 0 ? "danger" : undefined} />
      </div>

      {dsr.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Solicitações LGPD recentes (exportação / exclusão)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {dsr.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2">
                  <span className="w-32 text-xs text-muted-foreground">{formatDate(c.createdAt, true)}</span>
                  <Badge tone={c.type === "deletion_request" ? "danger" : "info"}>{c.type === "deletion_request" ? "Exclusão executada" : "Exportação baixada"}</Badge>
                  <span className="flex-1">{c.email}</span>
                  <span className="text-xs text-muted-foreground">IP {c.ip ?? "—"}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <form className="grid gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-[1fr_160px_140px_200px_auto]">
        <Input name="q" defaultValue={q} placeholder="Buscar por texto, e-mail, id, IP…" />
        <Select name="channel" defaultValue={channel ?? ""}>
          <option value="">Todos os canais</option>
          {AUDIT_CHANNELS.map((c) => <option key={c} value={c}>{channelLabel[c]}</option>)}
        </Select>
        <Select name="level" defaultValue={level ?? ""}>
          <option value="">Todos os níveis</option>
          {AUDIT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
        <Select name="action" defaultValue={sp.action ?? ""}>
          <option value="">Todas as ações</option>
          {actions.map((a) => <option key={a.a} value={a.a}>{a.a} ({a.n})</option>)}
        </Select>
        <button type="submit" className="h-10 rounded-lg bg-powder px-4 text-sm font-medium hover:bg-primary-strong">Filtrar</button>
      </form>

      <Table>
        <THead><tr><TH>Quando</TH><TH>Canal</TH><TH>Ação</TH><TH>Quem</TH><TH>Resumo</TH><TH>Entidade</TH><TH>IP</TH></tr></THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={7}>Nenhum evento.</EmptyRow>}
          {rows.map((r) => (
            <TR key={r.id} className={cn(r.level === "error" && "bg-red-50/60", r.level === "warn" && "bg-amber-50/50")}>
              <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(r.createdAt, true)}</TD>
              <TD><Badge tone={r.channel === "system" ? "info" : r.channel === "backoffice" ? "accent" : "neutral"}>{channelLabel[r.channel]}</Badge></TD>
              <TD><span className="font-mono text-xs">{r.action}</span> {r.level !== "info" && <Badge tone={levelTone[r.level]}>{r.level}</Badge>}</TD>
              <TD className="text-xs"><span className="block">{r.actorEmail ?? "—"}</span><span className="text-muted-foreground">{r.actorRole ?? ""}</span></TD>
              <TD className="max-w-md text-sm">{r.summary}{r.meta && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">detalhes</summary><pre className="max-w-md overflow-x-auto whitespace-pre-wrap">{JSON.stringify(r.meta, null, 1)}</pre></details>}</TD>
              <TD className="text-xs text-muted-foreground">{r.entityType}{r.entityId ? <span className="block font-mono">{r.entityId.slice(0, 8)}…</span> : null}</TD>
              <TD className="font-mono text-xs text-muted-foreground">{r.ip ?? "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Página {page} · {PAGE} por página</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={qs({ page: String(page - 1) })} className="rounded-lg border bg-card px-3 py-1.5 hover:bg-muted">← Anterior</Link>}
          {page * PAGE < total && <Link href={qs({ page: String(page + 1) })} className="rounded-lg border bg-card px-3 py-1.5 hover:bg-muted">Próxima →</Link>}
        </div>
      </div>
    </div>
  );
}
