import { describe, expect, it } from "vitest";
import type { ShippingZone } from "@/db/schema";
import { SETTING_DEFAULTS, type Settings } from "@/lib/settings";
import { clearShippingCache, DEFAULT_ZONES, formatCep, matchZone, normalizeCep, packItems, quoteShipping, type ShippableItem } from "@/lib/shipping";
import { addBusinessDays, estimateProductionDays } from "@/lib/production";

const zones: ShippingZone[] = DEFAULT_ZONES.map((z, i) => ({ ...z, id: `z${i}`, createdAt: new Date() }));
const settings = (over: Partial<Settings> = {}): Settings => ({ ...(SETTING_DEFAULTS as Settings), shop_city: "Americana", ...over });
const item = (over: Partial<ShippableItem> = {}): ShippableItem => ({ id: "p1", quantity: 1, unitPriceCents: 4990, weightGrams: 0, materialGrams: 80, widthCm: 0, heightCm: 0, lengthCm: 0, ...over });

describe("Frete: CEP e zonas locais", () => {
  it("normaliza e formata CEP", () => {
    expect(normalizeCep("13465-000")).toBe("13465000");
    expect(normalizeCep(" 13.465-000 ")).toBe("13465000");
    expect(normalizeCep("1346")).toBeNull();
    expect(formatCep("13465000")).toBe("13465-000");
  });

  it("acha a zona pela faixa e respeita ordem/ativa", () => {
    expect(matchZone("13470100", zones)?.name).toMatch(/Americana/);
    expect(matchZone("13456000", zones)?.name).toMatch(/Santa Bárbara/);
    expect(matchZone("13385000", zones)?.name).toMatch(/Nova Odessa/);
    expect(matchZone("13175000", zones)?.name).toMatch(/Sumaré/);
    expect(matchZone("01310100", zones)).toBeNull(); // São Paulo capital: fora
    const inactive = zones.map((z) => ({ ...z, active: false }));
    expect(matchZone("13470100", inactive)).toBeNull();
  });

  it("embala respeitando mínimos dos Correios e peso de embalagem", () => {
    const pk = packItems([item({ materialGrams: 20 }), item({ id: "p2", weightGrams: 900, lengthCm: 30, widthCm: 20, heightCm: 10, quantity: 2 })], settings({ shipping_pkg_weight_grams: "60", shipping_pkg_dims_cm: "16x12x6" }));
    expect(pk[0]).toMatchObject({ weightKg: 0.08, lengthCm: 16, widthCm: 12, heightCm: 6, insuranceBRL: 49.9 });
    expect(pk[1]).toMatchObject({ weightKg: 0.96, lengthCm: 30, widthCm: 20, heightCm: 10, quantity: 2 });
    // muito leve → mínimo 50 g
    expect(packItems([item({ materialGrams: 5 })], settings({ shipping_pkg_weight_grams: "0" }))[0].weightKg).toBe(0.05);
  });
});

describe("Prazo de produção", () => {
  it("itens em estoque = só embalagem; a imprimir = tempo de máquina / capacidade + embalagem", () => {
    const opts = { hoursPerDay: 8, machines: 1, handlingDays: 1 };
    expect(estimateProductionDays([{ printMinutes: 240, quantity: 2, inStock: true }], opts)).toBe(1);
    expect(estimateProductionDays([{ printMinutes: 240, quantity: 2, inStock: false }], opts)).toBe(2); // 480 min = 1 dia + 1 embalagem
    expect(estimateProductionDays([{ printMinutes: 240, quantity: 5, inStock: false }], opts)).toBe(4); // 1200 min → 3 dias + 1
    expect(estimateProductionDays([{ printMinutes: 240, quantity: 5, inStock: false }], { ...opts, machines: 2 })).toBe(3);
    expect(estimateProductionDays([], opts)).toBe(1);
    // pós-processamento é outra fila: 10 peças × 30 min = 300 min de mão de obra → 2 dias a 4 h/dia
    expect(estimateProductionDays([{ printMinutes: 60, laborMinutes: 30, quantity: 10, inStock: false }], { ...opts, laborHoursPerDay: 4 })).toBe(1 + 2 + 2); // 600 min máquina → 2 dias
    expect(estimateProductionDays([{ printMinutes: 0, laborMinutes: 30, quantity: 2, inStock: false }], opts)).toBe(2); // só acabamento
    expect(estimateProductionDays([{ printMinutes: 240, laborMinutes: 30, quantity: 1, inStock: true }], opts)).toBe(1); // em estoque ignora tudo
  });

  it("soma dias úteis pulando fim de semana", () => {
    const fri = new Date(2026, 8, 11); // sexta 11/09/2026
    expect(addBusinessDays(fri, 1).getDate()).toBe(14); // segunda
    expect(addBusinessDays(fri, 3).getDate()).toBe(16);
    expect(addBusinessDays(fri, 0).getDate()).toBe(11);
  });

  it("cotação embute a produção em todas as opções", async () => {
    const s = settings({ shipping_provider: "none", shipping_correios_cents: "2500", shipping_handling_days: "1" });
    const q = await quoteShipping({ cep: "13470100", items: [item({ printMinutes: 480, inStock: false })], subtotalCents: 4990, settings: s, zones });
    expect(q.productionDays).toBe(2);
    expect(q.options.find((o) => o.id === "pickup")!.daysMax).toBe(2);
    expect(q.options.find((o) => o.method === "delivery")!.daysMax).toBe(4); // zona 2 dias + 2
    const ready = await quoteShipping({ cep: "13470100", items: [item({ printMinutes: 480, inStock: true })], subtotalCents: 4990, settings: s, zones });
    expect(ready.productionDays).toBe(1);
  });
});

describe("Frete: cotação combinada", () => {
  it("sem CEP só oferece retirada", async () => {
    const q = await quoteShipping({ cep: null, items: [item()], subtotalCents: 4990, settings: settings(), zones });
    expect(q.options.map((o) => o.id)).toEqual(["pickup"]);
  });

  it("CEP de Americana: retirada + entrega local com preço da zona; grátis acima do limite da zona", async () => {
    const s = settings({ shipping_provider: "none", shipping_correios_cents: "0" });
    const q = await quoteShipping({ cep: "13470-100", items: [item()], subtotalCents: 4990, settings: s, zones });
    expect(q.zone?.name).toMatch(/Americana/);
    const local = q.options.find((o) => o.method === "delivery")!;
    expect(local.priceCents).toBe(800);
    expect(local.costCents).toBe(500);
    expect(local.daysMax).toBe(3); // 2 da zona + 1 de embalagem (item em estoque)
    const free = await quoteShipping({ cep: "13470100", items: [item()], subtotalCents: 12000, settings: s, zones });
    expect(free.options.find((o) => o.method === "delivery")!.priceCents).toBe(0);
  });

  it("fora das zonas com provedor desligado: cai no valor fixo de fallback", async () => {
    const q = await quoteShipping({ cep: "01310100", items: [item()], subtotalCents: 4990, settings: settings({ shipping_provider: "none", shipping_correios_cents: "2500", shipping_handling_days: "2" }), zones });
    expect(q.productionDays).toBe(2);
    expect(q.options.find((o) => o.method === "delivery")).toBeUndefined();
    const fb = q.options.find((o) => o.id === "fallback")!;
    expect(fb.priceCents).toBe(2500);
    expect(fb.daysMin).toBe(7);
  });

  it("com provedor: usa cotação real, soma acréscimo e dias de produção, ordena por preço e cacheia", async () => {
    clearShippingCache();
    process.env.SUPERFRETE_TOKEN = "tok";
    let calls = 0;
    const fetchQuotes = async () => {
      calls++;
      return [
        { serviceId: "2", name: "SEDEX", carrier: "Correios", priceCents: 2890, daysMin: 1, daysMax: 2 },
        { serviceId: "1", name: "PAC", carrier: "Correios", priceCents: 1990, daysMin: 4, daysMax: 7 },
      ];
    };
    const s = settings({ shipping_provider: "superfrete", shipping_extra_cents: "200", shipping_handling_days: "2", shipping_correios_cents: "2500" });
    const q = await quoteShipping({ cep: "01310100", items: [item()], subtotalCents: 4990, settings: s, zones, fetchQuotes });
    const carriers = q.options.filter((o) => o.method === "correios");
    expect(carriers.map((o) => o.name)).toEqual(["PAC", "SEDEX"]);
    expect(carriers[0]).toMatchObject({ id: "carrier:superfrete:1", priceCents: 2190, costCents: 1990, daysMin: 6, daysMax: 9 });
    expect(q.options.find((o) => o.id === "fallback")).toBeUndefined();
    await quoteShipping({ cep: "01310100", items: [item()], subtotalCents: 4990, settings: s, zones, fetchQuotes });
    expect(calls).toBe(1); // segunda chamada veio do cache
    delete process.env.SUPERFRETE_TOKEN;
  });

  it("provedor fora do ar: avisa e mostra o fallback", async () => {
    clearShippingCache();
    process.env.SUPERFRETE_TOKEN = "tok";
    const q = await quoteShipping({
      cep: "01310100",
      items: [item()],
      subtotalCents: 4990,
      settings: settings({ shipping_provider: "superfrete", shipping_correios_cents: "2500" }),
      zones,
      fetchQuotes: async () => {
        throw new Error("timeout");
      },
    });
    expect(q.warnings[0]).toMatch(/indisponível/);
    expect(q.options.find((o) => o.id === "fallback")?.priceCents).toBe(2500);
    delete process.env.SUPERFRETE_TOKEN;
  });

  it("frete grátis global zera transportadora e entrega local", async () => {
    const q = await quoteShipping({ cep: "13470100", items: [item()], subtotalCents: 30000, settings: settings({ shipping_provider: "none", free_shipping_from_cents: "20000" }), zones });
    expect(q.options.filter((o) => o.method !== "pickup").every((o) => o.priceCents === 0)).toBe(true);
  });
});
