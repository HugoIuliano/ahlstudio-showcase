import { Trash2 } from "lucide-react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { printers } from "@/db/schema";
import { printerStatusLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { deletePrinterAction } from "@/actions/erp";
import { PrinterForm } from "@/components/admin/simple-forms";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";

export default async function PrintersPage() {
  await requirePagePermission("machines.manage");
  const list = await db.query.printers.findMany({ orderBy: asc(printers.name), with: { jobs: { where: (j, { inArray }) => inArray(j.status, ["queued", "printing"]) } } });
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Máquinas do studio" description="O custo/hora alimenta a calculadora de preço." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{p.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{p.model ?? "—"}{p.bedSize ? ` · ${p.bedSize}` : ""}</p>
              </div>
              <StatusBadge value={p.status} map={printerStatusLabels} />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{formatBRL(p.hourlyCostCents)}/h · {Math.round(p.totalPrintMinutes / 60)} h impressas</p>
              <p>{p.jobs.length} job(s) na fila</p>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma máquina cadastrada.</p>}
      </div>

      <Card>
        <CardHeader><CardTitle>Nova máquina</CardTitle></CardHeader>
        <CardContent><PrinterForm /></CardContent>
      </Card>

      {list.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Editar</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {list.map((p) => (
              <div key={p.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex-1"><PrinterForm printer={p} /></div>
                <form action={deletePrinterAction} className="pt-6">
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" variant="outline" size="sm" className="text-danger" aria-label="Excluir máquina"><Trash2 /> Excluir</Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
