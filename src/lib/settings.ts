import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

// Chaves conhecidas e valores padrão. Editáveis em /admin/configuracoes.
export const SETTING_DEFAULTS = {
  shop_name: "AHL Studio",
  shop_tagline: "Impressão 3D sob medida",
  shop_whatsapp: "", // só dígitos com DDI, ex.: 5511999999999
  shop_instagram: "",
  shop_email: "",
  shop_city: "",
  shop_state: "SP",
  // dados legais (Termos de Uso / Política de Privacidade / LGPD)
  shop_legal_name: "", // razão social ou nome completo do titular (MEI)
  shop_cnpj: "", // CNPJ ou CPF
  shop_address: "",
  dpo_email: "", // encarregado de dados (LGPD art. 41)
  pix_key: "", // chave PIX para o modo manual
  pix_holder: "",
  // frete — editável em /admin/frete
  shipping_pickup_enabled: "true",
  shipping_pickup_note: "", // "Seg a sex, 9h–18h — avisamos quando estiver pronto"
  shipping_delivery_enabled: "true", // entrega local por zonas de CEP (tabela shipping_zones)
  shipping_correios_enabled: "true", // Correios/transportadoras via provedor de cotação
  shipping_provider: "superfrete", // superfrete | melhorenvio | none (none = só valor fixo abaixo)
  shipping_services: "17,1,2,3", // códigos do provedor: 17 Mini Envios · 1 PAC · 2 SEDEX · 3 Jadlog · 31 Loggi
  shipping_origin_cep: "13465000", // CEP de postagem (studio, Americana/SP)
  shipping_handling_days: "1", // dias úteis de embalagem/postagem (itens em estoque) — somados ao prazo de produção
  production_hours_per_day: "8", // horas de máquina por dia útil disponíveis para pedidos
  production_parallel_machines: "1", // máquinas imprimindo em paralelo
  production_labor_hours_per_day: "4", // horas/dia de mão de obra para pós-processamento (lixar, montar, embalar)
  production_stock_cover_days: "21", // sugestões de fornada: manter estoque para N dias de venda
  production_quote_sla_days: "2", // prazo (dias úteis) para responder um orçamento
  shipping_extra_cents: "0", // embalagem/manuseio somado a cada cotação de transportadora
  shipping_pkg_weight_grams: "60", // peso da embalagem (caixa + plástico) somado ao material
  shipping_pkg_dims_cm: "16x12x6", // comprimento x largura x altura padrão quando o produto não informa
  shipping_correios_cents: "2500", // valor fixo quando o provedor está desligado ou fora do ar
  free_shipping_from_cents: "0", // frete grátis (entrega local e transportadora) a partir de; 0 = desativado
  // financeiro
  fee_card_pct: "4.99", // taxa média cartão (Mercado Pago)
  fee_pix_pct: "0.99", // taxa PIX
  tax_pct: "6", // Simples Nacional / DAS aproximado sobre receita
  prob_quoted: "0.5", // chance de orçamento "orçado" virar venda
  prob_pending_payment: "0.7", // chance de pedido aguardando pagamento ser pago
  // parâmetros da calculadora de preço (ERP)
  pricing_labor_hourly_cents: "3000",
  pricing_failure_rate: "0.10",
  pricing_margin_pct: "0.80",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = Record<SettingKey, string>;

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settings);
  const map = { ...SETTING_DEFAULTS } as Settings;
  for (const r of rows) if (r.key in map) map[r.key as SettingKey] = r.value;
  return map;
}

export async function getSetting(key: SettingKey) {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function setSettings(values: Partial<Settings>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in SETTING_DEFAULTS) || value == null) continue;
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  }
}

export function whatsappLink(digits: string, text?: string) {
  if (!digits) return null;
  const url = new URL(`https://wa.me/${digits.replace(/\D/g, "")}`);
  if (text) url.searchParams.set("text", text);
  return url.toString();
}
