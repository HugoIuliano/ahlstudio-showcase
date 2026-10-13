"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products, productVariants, shippingZones } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseBRLToCents } from "@/lib/money";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getSettings, setSettings, type Settings } from "@/lib/settings";
import { clearShippingCache, DEFAULT_ZONES, normalizeCep, quoteShipping, type ShippableItem, type ShippingQuote } from "@/lib/shipping";
import { readShippingPref, writeShippingPref } from "@/lib/shipping-pref";
import { cartToShippable, getZones, quoteCart } from "@/lib/shipping-quote";
import { getBacklog } from "@/lib/production-queue";
import type { ActionState } from "@/components/ui/form-message";

/** Cotação para o carrinho atual (ou para um produto avulso na página dele). Grava o CEP no cookie. */
export async function quoteForCepAction(cepInput: string, single?: { productId: string; variantId?: string | null; quantity?: number }): Promise<ShippingQuote & { error?: string }> {
  const cep = normalizeCep(cepInput);
  if (!cep) return { cep: null, options: [], warnings: [], zone: null, productionDays: 0, error: "CEP inválido — use 8 dígitos" };
  try {
    await assertRateLimit("shipping:quote", 60, 10 * 60_000, { byIp: true });
  } catch (err) {
    if (err instanceof RateLimitError) return { cep, options: [], warnings: [], zone: null, productionDays: 0, error: "Muitas consultas de frete. Aguarde um minuto." };
    throw err;
  }

  const [settings, zones, backlog] = await Promise.all([getSettings(), getZones(), getBacklog()]);
  let items: ShippableItem[];
  let subtotalCents: number;
  if (single) {
    const p = await db.query.products.findFirst({ where: eq(products.id, single.productId) });
    if (!p) return { cep, options: [], warnings: [], zone: null, productionDays: 0, error: "Produto não encontrado" };
    const v = single.variantId ? await db.query.productVariants.findFirst({ where: eq(productVariants.id, single.variantId) }) : null;
    const qty = Math.max(1, Math.min(99, single.quantity ?? 1));
    const unit = p.priceCents + (v?.priceDeltaCents ?? 0);
    const stock = v ? v.stockQty : p.stockQty;
    items = [{ id: p.id, quantity: qty, unitPriceCents: unit, weightGrams: p.weightGrams, materialGrams: p.materialGrams, widthCm: p.widthCm, heightCm: p.heightCm, lengthCm: p.lengthCm, printMinutes: p.printMinutes, laborMinutes: p.laborMinutes, inStock: stock >= qty }];
    subtotalCents = unit * qty;
  } else {
    const { cart, pref } = await quoteCart(cep);
    items = cartToShippable(cart.items);
    subtotalCents = cart.subtotalCents;
    await writeShippingPref({ cep, optionId: pref.cep === cep ? pref.optionId : null });
  }
  const q = await quoteShipping({ cep, items, subtotalCents, settings, zones, backlog });
  // custo interno (etiqueta) não vai para o navegador
  return { ...q, options: q.options.map((o) => { const { costCents, ...rest } = o; void costCents; return rest; }) };
}

export async function selectShippingOptionAction(formData: FormData) {
  const optionId = String(formData.get("optionId") ?? "").slice(0, 80);
  const pref = await readShippingPref();
  await writeShippingPref({ cep: pref.cep, optionId: optionId || null });
  revalidatePath("/carrinho");
  revalidatePath("/checkout");
}

// ---------------------------------------------------------------- admin

const MONEY = new Set<keyof Settings>(["shipping_correios_cents", "free_shipping_from_cents", "shipping_extra_cents"]);
const BOOL = new Set<keyof Settings>(["shipping_pickup_enabled", "shipping_delivery_enabled", "shipping_correios_enabled"]);
const KEYS: (keyof Settings)[] = [
  "shipping_pickup_enabled",
  "shipping_pickup_note",
  "shipping_delivery_enabled",
  "shipping_correios_enabled",
  "shipping_provider",
  "shipping_services",
  "shipping_origin_cep",
  "shipping_handling_days",
  "production_hours_per_day",
  "production_parallel_machines",
  "production_labor_hours_per_day",
  "production_stock_cover_days",
  "production_quote_sla_days",
  "shipping_extra_cents",
  "shipping_pkg_weight_grams",
  "shipping_pkg_dims_cm",
  "shipping_correios_cents",
  "free_shipping_from_cents",
];

export async function saveShippingSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("settings.manage");
  const values: Partial<Settings> = {};
  for (const key of KEYS) {
    if (BOOL.has(key)) {
      values[key] = formData.get(key) === "on" ? "true" : "false";
      continue;
    }
    const raw = formData.get(key);
    if (raw == null) continue;
    values[key] = MONEY.has(key) ? String(parseBRLToCents(String(raw))) : String(raw).trim();
  }
  if (values.shipping_origin_cep && !normalizeCep(values.shipping_origin_cep)) return { error: "CEP de origem inválido" };
  if (values.shipping_origin_cep) values.shipping_origin_cep = normalizeCep(values.shipping_origin_cep)!;
  if (values.shipping_provider && !["superfrete", "melhorenvio", "none"].includes(values.shipping_provider)) return { error: "Provedor inválido" };
  if (values.shipping_services) values.shipping_services = values.shipping_services.split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).join(",") || "1,2";
  if (values.shipping_pkg_dims_cm && !/^\d+\s*[x×]\s*\d+\s*[x×]\s*\d+$/i.test(values.shipping_pkg_dims_cm)) return { error: "Dimensões padrão no formato C x L x A, ex.: 16x12x6" };
  await setSettings(values);
  clearShippingCache();
  await audit({ action: "shipping.settings_updated", entityType: "settings", summary: "Configurações de frete atualizadas", meta: values });
  revalidatePath("/admin/frete");
  revalidatePath("/checkout");
  return { ok: true, message: "Frete salvo" };
}

const zoneSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome da zona").max(80),
  cepStart: z.string().min(8, "CEP inicial"),
  cepEnd: z.string().min(8, "CEP final"),
  price: z.string().default("0"),
  cost: z.string().optional(),
  freeFrom: z.string().optional(),
  minDays: z.coerce.number().int().min(0).default(1),
  maxDays: z.coerce.number().int().min(0).default(2),
  note: z.string().max(200).optional(),
  active: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveZoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("settings.manage");
  const parsed = zoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;
  const start = normalizeCep(d.cepStart);
  const end = normalizeCep(d.cepEnd);
  if (!start || !end) return { error: "Faixa de CEP inválida (8 dígitos cada)" };
  if (Number(start) > Number(end)) return { error: "CEP inicial maior que o final" };
  const values = {
    name: d.name,
    cepStart: Number(start),
    cepEnd: Number(end),
    priceCents: parseBRLToCents(d.price),
    costCents: d.cost ? parseBRLToCents(d.cost) : 0,
    freeFromCents: d.freeFrom ? parseBRLToCents(d.freeFrom) : 0,
    minDays: Math.min(d.minDays, d.maxDays),
    maxDays: Math.max(d.minDays, d.maxDays),
    note: d.note?.trim() || null,
    active: d.id ? d.active === "on" : true,
    sortOrder: d.sortOrder,
  };
  if (d.id) await db.update(shippingZones).set(values).where(eq(shippingZones.id, d.id));
  else await db.insert(shippingZones).values(values);
  await audit({ action: d.id ? "shipping.zone_updated" : "shipping.zone_created", entityType: "shipping_zone", entityId: d.id, summary: `Zona "${d.name}" ${start}–${end} · R$ ${(values.priceCents / 100).toFixed(2)}`, meta: values });
  revalidatePath("/admin/frete");
  return { ok: true, message: d.id ? "Zona salva" : "Zona criada" };
}

export async function deleteZoneAction(formData: FormData) {
  await requirePermission("settings.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(shippingZones).where(eq(shippingZones.id, id));
  await audit({ action: "shipping.zone_deleted", entityType: "shipping_zone", entityId: id, summary: "Zona de entrega excluída", level: "warn" });
  revalidatePath("/admin/frete");
}

/** Cria as zonas padrão da região de Americana (só as faixas que ainda não existem). */
export async function seedDefaultZonesAction() {
  await requirePermission("settings.manage");
  const existing = await getZones();
  const missing = DEFAULT_ZONES.filter((z) => !existing.some((e) => e.cepStart === z.cepStart && e.cepEnd === z.cepEnd));
  if (missing.length) await db.insert(shippingZones).values(missing);
  await audit({ action: "shipping.zones_seeded", entityType: "shipping_zone", summary: `${missing.length} zona(s) padrão criada(s)` });
  revalidatePath("/admin/frete");
}

export type QuoteTestState = { ok?: boolean; error?: string; message?: string; quote?: ShippingQuote } | null | undefined;

/** Teste de cotação no admin: CEP + peso/dimensões de um pacote genérico. */
export async function testQuoteAction(_prev: QuoteTestState, formData: FormData): Promise<QuoteTestState> {
  await requirePermission("settings.manage");
  const cep = normalizeCep(String(formData.get("cep") ?? ""));
  if (!cep) return { error: "CEP inválido" };
  const grams = Math.max(1, Number(formData.get("grams") ?? 150) || 150);
  const valueCents = parseBRLToCents(String(formData.get("value") ?? "50,00")) || 5000;
  const [settings, zones, backlog] = await Promise.all([getSettings(), getZones(), getBacklog()]);
  clearShippingCache();
  const printMinutes = Math.max(0, Number(formData.get("printMinutes") ?? 0) || 0);
  const laborMinutes = Math.max(0, Number(formData.get("laborMinutes") ?? 0) || 0);
  const quote = await quoteShipping({ cep, items: [{ id: "teste", quantity: 1, unitPriceCents: valueCents, weightGrams: grams, materialGrams: grams, widthCm: 0, heightCm: 0, lengthCm: 0, printMinutes, laborMinutes, inStock: printMinutes === 0 && laborMinutes === 0 }], subtotalCents: valueCents, settings, zones, backlog });
  return { ok: true, message: `${quote.options.length} opção(ões) para ${cep}`, quote };
}
