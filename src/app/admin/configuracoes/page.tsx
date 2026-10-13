import { getSettings } from "@/lib/settings";
import { isMercadoPagoEnabled } from "@/lib/mercadopago";
import { SettingsForm } from "@/components/admin/simple-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";

export default async function SettingsPage() {
  await requirePagePermission("settings.manage");
  const s = await getSettings();
  const integrations = [
    { name: "Banco (Turso)", ok: !!process.env.TURSO_DATABASE_URL, hint: process.env.TURSO_DATABASE_URL ? "conectado" : "usando SQLite local (dev)" },
    { name: "Mercado Pago", ok: isMercadoPagoEnabled(), hint: isMercadoPagoEnabled() ? "checkout online ativo" : "MP_ACCESS_TOKEN ausente → PIX manual" },
    { name: "Login com Google", ok: !!process.env.AUTH_GOOGLE_ID, hint: process.env.AUTH_GOOGLE_ID ? "ativo" : "AUTH_GOOGLE_ID/SECRET ausentes" },
    { name: "AUTH_SECRET", ok: !!process.env.AUTH_SECRET, hint: process.env.AUTH_SECRET ? "definido" : "defina em produção" },
  ];
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Configurações" description="Dados da loja, PIX, frete e parâmetros da calculadora." />
      <Card>
        <CardHeader><CardTitle>Integrações (variáveis de ambiente)</CardTitle></CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {integrations.map((i) => (
              <li key={i.name} className="flex items-center gap-2 rounded-lg border p-2.5">
                <span className={`size-2.5 rounded-full ${i.ok ? "bg-emerald-500" : "bg-amber-400"}`} />
                <span className="font-medium">{i.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{i.hint}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5"><SettingsForm settings={s} /></CardContent>
      </Card>
    </div>
  );
}
