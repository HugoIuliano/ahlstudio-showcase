/**
 * Provedores de cotação de frete (Correios/Jadlog/Loggi…) via agregadores.
 * Não usamos a API oficial dos Correios: desde 2023 ela exige contrato (Bronze+) — inviável para a loja.
 *
 *  - SuperFrete  — token pessoal no painel (web.superfrete.com → Integrações → Desenvolvedores)
 *  - Melhor Envio — token no painel (Integrações → Permissões de acesso) ou OAuth
 *
 * Tokens só por variável de ambiente (SUPERFRETE_TOKEN / MELHORENVIO_TOKEN); SHIPPING_SANDBOX=true usa os ambientes de teste.
 */

export type ProviderName = "superfrete" | "melhorenvio";

export type PackageItem = {
  id: string;
  quantity: number;
  weightKg: number;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
  insuranceBRL: number;
};

export type ProviderQuote = {
  serviceId: string; // código do serviço no provedor ("1" = PAC)
  name: string; // "PAC", "SEDEX", ".Package"
  carrier: string; // "Correios", "Jadlog"
  priceCents: number;
  daysMin: number;
  daysMax: number;
};

export type QuoteRequest = { fromCep: string; toCep: string; items: PackageItem[]; services: string };

export class ShippingProviderError extends Error {
  constructor(message: string, public readonly provider: ProviderName, public readonly status?: number) {
    super(message);
  }
}

const TIMEOUT_MS = 9000;
const UA = "AHLStudio/1.0 (contato@ahlstudio.com.br)";

export function providerToken(name: ProviderName) {
  return (name === "superfrete" ? process.env.SUPERFRETE_TOKEN : process.env.MELHORENVIO_TOKEN)?.trim() || null;
}

export function providerConfigured(name: ProviderName | "none" | string) {
  return name === "superfrete" || name === "melhorenvio" ? !!providerToken(name) : false;
}

function baseUrl(name: ProviderName) {
  const sandbox = process.env.SHIPPING_SANDBOX === "true";
  if (name === "superfrete") return sandbox ? "https://sandbox.superfrete.com" : "https://api.superfrete.com";
  return sandbox ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br";
}

const toCents = (v: unknown) => Math.round(Number(String(v ?? "0").replace(",", ".")) * 100) || 0;

async function post(name: ProviderName, path: string, body: unknown) {
  const token = providerToken(name);
  if (!token) throw new ShippingProviderError("Provedor de frete sem token configurado", name);
  const res = await fetch(`${baseUrl(name)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`;
    throw new ShippingProviderError(String(msg), name, res.status);
  }
  return json;
}

/** SuperFrete — POST /api/v0/calculator */
async function quoteSuperFrete(req: QuoteRequest): Promise<ProviderQuote[]> {
  const insurance = req.items.reduce((s, i) => s + i.insuranceBRL * i.quantity, 0);
  const json = await post("superfrete", "/api/v0/calculator", {
    from: { postal_code: req.fromCep },
    to: { postal_code: req.toCep },
    services: req.services,
    options: { own_hand: false, receipt: false, insurance_value: Math.round(insurance * 100) / 100, use_insurance_value: insurance > 0 },
    products: req.items.map((i) => ({ quantity: i.quantity, weight: i.weightKg, height: i.heightCm, width: i.widthCm, length: i.lengthCm })),
  });
  if (!Array.isArray(json)) throw new ShippingProviderError("Resposta inesperada da SuperFrete", "superfrete");
  return json
    .filter((s) => s && !s.has_error && Number(s.price) > 0)
    .map((s) => ({
      serviceId: String(s.id),
      name: String(s.name),
      carrier: String(s.company?.name ?? "Transportadora"),
      priceCents: toCents(s.price),
      daysMin: Number(s.delivery_range?.min ?? s.delivery_time ?? 0),
      daysMax: Number(s.delivery_range?.max ?? s.delivery_time ?? 0),
    }));
}

/** Melhor Envio — POST /api/v2/me/shipment/calculate (usar custom_price/custom_delivery_time) */
async function quoteMelhorEnvio(req: QuoteRequest): Promise<ProviderQuote[]> {
  const json = await post("melhorenvio", "/api/v2/me/shipment/calculate", {
    from: { postal_code: req.fromCep },
    to: { postal_code: req.toCep },
    services: req.services,
    options: { receipt: false, own_hand: false },
    products: req.items.map((i) => ({ id: i.id, quantity: i.quantity, weight: i.weightKg, height: i.heightCm, width: i.widthCm, length: i.lengthCm, insurance_value: Math.round(i.insuranceBRL * 100) / 100 })),
  });
  if (!Array.isArray(json)) throw new ShippingProviderError("Resposta inesperada do Melhor Envio", "melhorenvio");
  return json
    .filter((s) => s && !s.error && Number(s.custom_price ?? s.price) > 0)
    .map((s) => ({
      serviceId: String(s.id),
      name: String(s.name),
      carrier: String(s.company?.name ?? "Transportadora"),
      priceCents: toCents(s.custom_price ?? s.price),
      daysMin: Number(s.custom_delivery_range?.min ?? s.delivery_range?.min ?? s.custom_delivery_time ?? s.delivery_time ?? 0),
      daysMax: Number(s.custom_delivery_range?.max ?? s.delivery_range?.max ?? s.custom_delivery_time ?? s.delivery_time ?? 0),
    }));
}

export async function quoteWithProvider(name: ProviderName, req: QuoteRequest) {
  return name === "superfrete" ? quoteSuperFrete(req) : quoteMelhorEnvio(req);
}

/** Link do painel do provedor para emitir a etiqueta do pedido. */
export function providerPanelUrl(name: ProviderName | string) {
  if (name === "melhorenvio") return "https://app.melhorenvio.com.br/";
  return "https://web.superfrete.com/#/calculator";
}

export const PROVIDER_LABELS: Record<ProviderName | "none", string> = {
  superfrete: "SuperFrete (Correios, Jadlog, Loggi)",
  melhorenvio: "Melhor Envio (Correios, Jadlog, Azul, J&T)",
  none: "Desligado — valor fixo",
};

/** Códigos de serviço conhecidos (iguais nos dois provedores para Correios/Jadlog). */
export const SERVICE_CODES: { code: string; label: string }[] = [
  { code: "17", label: "Correios Mini Envios (até 300 g)" },
  { code: "1", label: "Correios PAC" },
  { code: "2", label: "Correios SEDEX" },
  { code: "3", label: "Jadlog .Package" },
  { code: "4", label: "Jadlog .Com (só Melhor Envio)" },
  { code: "31", label: "Loggi (só SuperFrete)" },
];
