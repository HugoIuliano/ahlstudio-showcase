import { requirePagePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { providerConfigured, providerPanelUrl } from "@/lib/shipping-providers";
import { getZones } from "@/lib/shipping-quote";
import { ShippingSettingsForm, TestQuoteForm, ZonesManager } from "@/components/admin/shipping-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function ShippingAdminPage() {
  await requirePagePermission("settings.manage");
  const [s, zones] = await Promise.all([getSettings(), getZones()]);
  const providerReady = providerConfigured(s.shipping_provider);
  const sandbox = process.env.SHIPPING_SANDBOX === "true";

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Frete e entrega"
        description="Retirada, entrega local por zonas de CEP e cotação real de Correios/transportadoras."
        actions={s.shipping_provider !== "none" && <a href={providerPanelUrl(s.shipping_provider)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted">Abrir painel do provedor ↗</a>}
      />

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3"><span className={`size-2.5 rounded-full ${s.shipping_pickup_enabled === "true" ? "bg-emerald-500" : "bg-zinc-300"}`} /> Retirada {s.shipping_pickup_enabled === "true" ? "ativa" : "desligada"}</div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3"><span className={`size-2.5 rounded-full ${s.shipping_delivery_enabled === "true" && zones.some((z) => z.active) ? "bg-emerald-500" : "bg-amber-400"}`} /> Entrega local · {zones.filter((z) => z.active).length} zona(s)</div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <span className={`size-2.5 rounded-full ${s.shipping_correios_enabled !== "true" ? "bg-zinc-300" : providerReady ? "bg-emerald-500" : "bg-amber-400"}`} />
          <span>Transportadoras · {s.shipping_correios_enabled !== "true" ? "desligadas" : providerReady ? `cotação real${sandbox ? " (sandbox)" : ""}` : "valor fixo (sem token)"}</span>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Regras</CardTitle></CardHeader>
        <CardContent><ShippingSettingsForm settings={s} providerReady={providerReady} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zonas de entrega local</CardTitle>
          <p className="text-sm text-muted-foreground">O CEP do cliente cai na primeira zona ativa que o contém (menor ordem primeiro). Faixas oficiais: Americana 13465–13479 · Sta. Bárbara 13450–13464 · Nova Odessa 13380–13389 · Sumaré 13170–13182 · Hortolândia 13183–13189 · Limeira 13480–13489 · Paulínia 13140–13149 · Cosmópolis 13150–13159.</p>
        </CardHeader>
        <CardContent><ZonesManager zones={zones} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Testar cotação</CardTitle>
          <p className="text-sm text-muted-foreground">Simula o que o cliente veria para um CEP. Limpa o cache de cotações.</p>
        </CardHeader>
        <CardContent><TestQuoteForm /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Como ligar a cotação real</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong className="text-foreground">SuperFrete</strong> (recomendado): crie a conta em superfrete.com → <em>Integrações → Desenvolvedores → Integrar</em> → copie o token → defina <code>SUPERFRETE_TOKEN</code> no ambiente (Secret Manager em produção). Para testar sem custo use o token de <em>sandbox.superfrete.com</em> com <code>SHIPPING_SANDBOX=true</code>.</p>
          <p><strong className="text-foreground">Melhor Envio</strong>: painel → <em>Integrações → Permissões de acesso</em> → gerar token com escopo <code>shipping-calculate</code> → <code>MELHORENVIO_TOKEN</code>.</p>
          <p>Sem token, a loja mostra o <em>valor fixo de fallback</em>. A etiqueta é emitida no painel do provedor a partir do endereço do pedido; cole o código de rastreio no pedido.</p>
        </CardContent>
      </Card>
    </div>
  );
}
