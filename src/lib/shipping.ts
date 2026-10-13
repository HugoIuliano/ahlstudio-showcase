import type { ShippingMethod, ShippingZone } from "@/db/schema";
import type { Settings } from "@/lib/settings";
import { estimateProductionDays } from "@/lib/production";
import { type PackageItem, type ProviderName, providerConfigured, quoteWithProvider, ShippingProviderError } from "@/lib/shipping-providers";

/**
 * Motor de frete da loja. Três canais, todos cotados no servidor:
 *  1. Retirada no studio (grátis)
 *  2. Entrega local por zonas de CEP (região de Americana/SP) — regras na tabela shipping_zones
 *  3. Correios/transportadoras — cotação real e dinâmica via SuperFrete ou Melhor Envio; valor fixo de fallback
 * O cliente escolhe uma opção pelo `id`; no checkout a cotação é refeita e o preço vem daqui, nunca do formulário.
 */

export type ShippingOption = {
  id: string; // "pickup" | "zone:<id>" | "carrier:<provider>:<serviceId>" | "fallback"
  method: ShippingMethod;
  name: string; // "Retirada no studio" · "Entrega local — Zona 1 (Americana)" · "SEDEX"
  carrier: string | null; // "Correios", "Jadlog", null
  priceCents: number; // cobrado do cliente
  /** custo real para o studio (etiqueta do provedor / custo da zona). Só no servidor — o cliente não recebe. */
  costCents?: number;
  daysMin: number; // dias úteis, já incluindo produção/postagem
  daysMax: number;
  description: string;
};

export type ShippingQuote = {
  cep: string | null; // 8 dígitos
  options: ShippingOption[];
  warnings: string[]; // ex.: "Transportadoras indisponíveis no momento"
  zone: ShippingZone | null;
  /** dias úteis de produção estimados para estes itens (já embutidos em daysMin/daysMax das opções) */
  productionDays: number;
};

/** Item mínimo para embalar: dimensões do produto (0 = padrão) e valor para seguro. */
export type ShippableItem = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  weightGrams: number; // 0 = derivar de materialGrams
  materialGrams: number;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
  /** prazo de produção: minutos de máquina por unidade e se sai do estoque pronto (padrão: pronto) */
  printMinutes?: number;
  laborMinutes?: number;
  inStock?: boolean;
};

/** Dias úteis de produção para um conjunto de itens, com a capacidade configurada. */
export type QueueBacklog = { printMinutes: number; laborMinutes: number };

export function productionDaysFor(items: ShippableItem[], s: Settings, backlog?: QueueBacklog | null) {
  return estimateProductionDays(
    items.map((i) => ({ printMinutes: i.printMinutes ?? 0, laborMinutes: i.laborMinutes ?? 0, quantity: i.quantity, inStock: i.inStock ?? true })),
    {
      hoursPerDay: Number(s.production_hours_per_day) || 8,
      machines: Number(s.production_parallel_machines) || 1,
      laborHoursPerDay: Number(s.production_labor_hours_per_day) || 4,
      handlingDays: Number(s.shipping_handling_days) || 0,
      backlogPrintMinutes: backlog?.printMinutes ?? 0,
      backlogLaborMinutes: backlog?.laborMinutes ?? 0,
    },
  );
}

// ---------------------------------------------------------------- CEP

export function normalizeCep(input: string | null | undefined): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

export function formatCep(cep: string) {
  const d = cep.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

// ---------------------------------------------------------------- zonas locais

export function matchZone(cep: string, zones: ShippingZone[]): ShippingZone | null {
  const n = Number(cep);
  if (!Number.isFinite(n)) return null;
  return [...zones].filter((z) => z.active && n >= z.cepStart && n <= z.cepEnd).sort((a, b) => a.sortOrder - b.sortOrder || a.priceCents - b.priceCents)[0] ?? null;
}

/** Zonas iniciais da região de Americana/SP (faixas oficiais de CEP dos municípios). */
export const DEFAULT_ZONES: Omit<ShippingZone, "id" | "createdAt">[] = [
  { name: "Zona 1 — Americana", cepStart: 13465000, cepEnd: 13479999, priceCents: 800, costCents: 500, freeFromCents: 12000, minDays: 1, maxDays: 2, note: "Entrega do studio; combinamos o horário pelo WhatsApp", active: true, sortOrder: 1 },
  { name: "Zona 2 — Santa Bárbara d'Oeste", cepStart: 13450000, cepEnd: 13464999, priceCents: 1200, costCents: 800, freeFromCents: 18000, minDays: 1, maxDays: 3, note: null, active: true, sortOrder: 2 },
  { name: "Zona 2 — Nova Odessa", cepStart: 13380000, cepEnd: 13389999, priceCents: 1200, costCents: 800, freeFromCents: 18000, minDays: 1, maxDays: 3, note: null, active: true, sortOrder: 2 },
  { name: "Zona 3 — Sumaré", cepStart: 13170000, cepEnd: 13182999, priceCents: 1800, costCents: 1200, freeFromCents: 25000, minDays: 2, maxDays: 4, note: null, active: true, sortOrder: 3 },
  { name: "Zona 3 — Hortolândia", cepStart: 13183000, cepEnd: 13189999, priceCents: 1800, costCents: 1200, freeFromCents: 25000, minDays: 2, maxDays: 4, note: null, active: true, sortOrder: 3 },
  { name: "Zona 3 — Limeira", cepStart: 13480000, cepEnd: 13489999, priceCents: 1800, costCents: 1200, freeFromCents: 25000, minDays: 2, maxDays: 4, note: null, active: true, sortOrder: 3 },
  { name: "Zona 3 — Paulínia", cepStart: 13140000, cepEnd: 13149999, priceCents: 1800, costCents: 1200, freeFromCents: 25000, minDays: 2, maxDays: 4, note: null, active: true, sortOrder: 3 },
  { name: "Zona 3 — Cosmópolis", cepStart: 13150000, cepEnd: 13159999, priceCents: 1800, costCents: 1200, freeFromCents: 25000, minDays: 2, maxDays: 4, note: null, active: true, sortOrder: 3 },
];

// ---------------------------------------------------------------- embalagem

export function parseDims(spec: string): { lengthCm: number; widthCm: number; heightCm: number } {
  const [l, w, h] = spec.split(/[x×]/i).map((v) => Number(v.trim()) || 0);
  return { lengthCm: l || 16, widthCm: w || 12, heightCm: h || 6 };
}

/**
 * Converte itens do carrinho em volumes para o provedor. Cada produto vira uma linha (o agregador empacota).
 * Respeita mínimos dos Correios (16×11×2 cm, 0,05 kg) para a cotação não ser recusada.
 */
export function packItems(items: ShippableItem[], s: Settings): PackageItem[] {
  const def = parseDims(s.shipping_pkg_dims_cm);
  const pkgGrams = Number(s.shipping_pkg_weight_grams) || 0;
  return items
    .filter((i) => i.quantity > 0)
    .map((i) => {
      const grams = (i.weightGrams > 0 ? i.weightGrams : i.materialGrams) + pkgGrams;
      return {
        id: i.id,
        quantity: i.quantity,
        weightKg: Math.max(0.05, Math.round(grams) / 1000),
        lengthCm: Math.max(16, i.lengthCm || def.lengthCm),
        widthCm: Math.max(11, i.widthCm || def.widthCm),
        heightCm: Math.max(2, i.heightCm || def.heightCm),
        insuranceBRL: i.unitPriceCents / 100,
      };
    });
}

// ---------------------------------------------------------------- cache de cotações (por instância)

type CacheEntry = { at: number; quotes: Awaited<ReturnType<typeof quoteWithProvider>> };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20 * 60_000;

function cacheKey(provider: string, from: string, to: string, items: PackageItem[], services: string) {
  return `${provider}|${from}|${to}|${services}|${items.map((i) => `${i.quantity}x${i.weightKg}x${i.lengthCm}x${i.widthCm}x${i.heightCm}x${i.insuranceBRL}`).join(",")}`;
}

export function clearShippingCache() {
  cache.clear();
}

// ---------------------------------------------------------------- cotação

export type QuoteInput = {
  cep: string | null | undefined;
  items: ShippableItem[];
  subtotalCents: number;
  settings: Settings;
  zones: ShippingZone[];
  /** sobrescreve o prazo de produção calculado a partir dos itens */
  productionDays?: number;
  /** fila de produção já comprometida (entra na frente dos itens a produzir) */
  backlog?: QueueBacklog | null;
  /** injeção para testes */
  fetchQuotes?: typeof quoteWithProvider;
};

export async function quoteShipping(input: QuoteInput): Promise<ShippingQuote> {
  const s = input.settings;
  const cep = normalizeCep(input.cep);
  const options: ShippingOption[] = [];
  const warnings: string[] = [];
  const freeFrom = Number(s.free_shipping_from_cents) || 0;
  const globallyFree = freeFrom > 0 && input.subtotalCents >= freeFrom;
  // prazo de produção do pedido (itens a imprimir + embalagem) — somado a todas as opções
  const production = input.productionDays ?? productionDaysFor(input.items, s, input.backlog);

  if (s.shipping_pickup_enabled === "true") {
    options.push({
      id: "pickup",
      method: "pickup",
      name: "Retirada no studio",
      carrier: null,
      priceCents: 0,
      costCents: 0,
      daysMin: production,
      daysMax: production,
      description: s.shipping_pickup_note || (s.shop_city ? `Retire em ${s.shop_city} — avisamos quando estiver pronto` : "Avisamos quando estiver pronto"),
    });
  }

  if (!cep) return { cep: null, options, warnings, zone: null, productionDays: production };

  let zone: ShippingZone | null = null;
  if (s.shipping_delivery_enabled === "true") {
    zone = matchZone(cep, input.zones);
    if (zone) {
      const zoneFree = zone.freeFromCents > 0 && input.subtotalCents >= zone.freeFromCents;
      options.push({
        id: `zone:${zone.id}`,
        method: "delivery",
        name: `Entrega local — ${zone.name}`,
        carrier: "AHL Studio",
        priceCents: globallyFree || zoneFree ? 0 : zone.priceCents,
        costCents: zone.costCents,
        daysMin: zone.minDays + production,
        daysMax: zone.maxDays + production,
        description: zone.note || "Entregamos na sua porta; combinamos o melhor horário pelo WhatsApp",
      });
    }
  }

  if (s.shipping_correios_enabled === "true" && input.items.length > 0) {
    const provider = s.shipping_provider as ProviderName | "none";
    const handling = production;
    const extra = Number(s.shipping_extra_cents) || 0;
    let gotCarrier = false;

    if (provider !== "none" && providerConfigured(provider)) {
      const from = normalizeCep(s.shipping_origin_cep);
      if (!from) warnings.push("CEP de origem inválido nas configurações de frete");
      else {
        const items = packItems(input.items, s);
        const key = cacheKey(provider, from, cep, items, s.shipping_services);
        const hit = cache.get(key);
        try {
          const quotes = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.quotes : await (input.fetchQuotes ?? quoteWithProvider)(provider, { fromCep: from, toCep: cep, items, services: s.shipping_services });
          if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) {
            if (cache.size > 500) cache.clear();
            cache.set(key, { at: Date.now(), quotes });
          }
          for (const q of quotes) {
            gotCarrier = true;
            options.push({
              id: `carrier:${provider}:${q.serviceId}`,
              method: "correios",
              name: q.name,
              carrier: q.carrier,
              priceCents: globallyFree ? 0 : q.priceCents + extra,
              costCents: q.priceCents, // etiqueta paga ao provedor
              daysMin: q.daysMin + handling,
              daysMax: q.daysMax + handling,
              description: `${q.carrier} · postamos em ${handling} dia${handling === 1 ? "" : "s"} útil${handling === 1 ? "" : "eis"} · com rastreio`,
            });
          }
          if (!gotCarrier) warnings.push("Nenhuma transportadora atende este CEP com as dimensões do pedido");
        } catch (err) {
          const msg = err instanceof ShippingProviderError ? `${err.provider}: ${err.message}` : String((err as Error)?.message ?? err);
          console.warn("cotação de frete falhou", msg);
          warnings.push("Cotação das transportadoras indisponível agora — mostramos um valor estimado");
        }
      }
    }

    // Fallback: valor fixo quando não há provedor ou a cotação falhou
    if (!gotCarrier && Number(s.shipping_correios_cents) > 0) {
      options.push({
        id: "fallback",
        method: "correios",
        name: "Correios (valor estimado)",
        carrier: "Correios",
        priceCents: globallyFree ? 0 : Number(s.shipping_correios_cents),
        costCents: Number(s.shipping_correios_cents),
        daysMin: 5 + handling,
        daysMax: 12 + handling,
        description: "Valor fixo; se o frete real for menor, devolvemos a diferença",
      });
    }
  }

  // ordena: retirada, local, depois transportadoras por preço
  const rank = (o: ShippingOption) => (o.method === "pickup" ? 0 : o.method === "delivery" ? 1 : 2);
  options.sort((a, b) => rank(a) - rank(b) || a.priceCents - b.priceCents || a.daysMax - b.daysMax);
  return { cep, options, warnings, zone, productionDays: production };
}

export function describeDays(o: Pick<ShippingOption, "daysMin" | "daysMax" | "method">) {
  if (o.method === "pickup") return o.daysMax > 0 ? `pronto em ~${o.daysMax} dia${o.daysMax === 1 ? "" : "s"} úteis` : "retire quando estiver pronto";
  if (o.daysMin === o.daysMax) return `${o.daysMax} dia${o.daysMax === 1 ? "" : "s"} úteis`;
  return `${o.daysMin} a ${o.daysMax} dias úteis`;
}
