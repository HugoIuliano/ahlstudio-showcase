import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderEvents, orderItems, orders, printJobs, products, quotes, type Order, type PrintJob, type Product, type ProductVariant } from "@/db/schema";
import { addBusinessDays } from "./production";
import type { Settings } from "./settings";

/**
 * Fila de produção: o que entra, em que ordem, quanto falta e o que vale produzir na ociosidade.
 *  - jobs nascem automaticamente quando um pedido é pago (itens sem estoque e personalizados)
 *  - a ordem é pelo prazo alvo (dueAt), depois prioridade manual
 *  - o backlog (minutos de máquina + de mão de obra ainda não feitos) alimenta o prazo de novas vendas
 */

export type Capacity = { hoursPerDay: number; machines: number; laborHoursPerDay: number };

export function capacityFrom(s: Settings): Capacity {
  return { hoursPerDay: Number(s.production_hours_per_day) || 8, machines: Number(s.production_parallel_machines) || 1, laborHoursPerDay: Number(s.production_labor_hours_per_day) || 4 };
}

// ---------------------------------------------------------------- backlog (com cache curto por instância)

export type Backlog = { printMinutes: number; laborMinutes: number; jobs: number };
let backlogCache: { at: number; value: Backlog } | null = null;
const BACKLOG_TTL_MS = 60_000;

export function clearBacklogCache() {
  backlogCache = null;
}

/** Minutos ainda não produzidos na fila (jobs na fila + imprimindo). */
export async function getBacklog(): Promise<Backlog> {
  if (backlogCache && Date.now() - backlogCache.at < BACKLOG_TTL_MS) return backlogCache.value;
  const rows = await db
    .select({ print: sql<number>`coalesce(sum(${printJobs.estimatedMinutes}), 0)`, labor: sql<number>`coalesce(sum(${printJobs.laborMinutes}), 0)`, n: sql<number>`count(*)` })
    .from(printJobs)
    .where(inArray(printJobs.status, ["queued", "printing"]));
  const value = { printMinutes: Number(rows[0]?.print ?? 0), laborMinutes: Number(rows[0]?.labor ?? 0), jobs: Number(rows[0]?.n ?? 0) };
  backlogCache = { at: Date.now(), value };
  return value;
}

export function backlogDays(b: Backlog, c: Capacity) {
  return Math.ceil(b.printMinutes / Math.max(60, c.hoursPerDay * 60 * Math.max(1, c.machines))) + Math.ceil(b.laborMinutes / Math.max(60, c.laborHoursPerDay * 60));
}

// ---------------------------------------------------------------- entrada de pedidos na fila

/**
 * Cria jobs para os itens de um pedido que precisam ser produzidos (toProduceQty > 0 ou personalizados).
 * `includeInStock` força um job para todo item (botão manual do admin). Idempotente por item.
 */
export async function enqueueOrderJobs(orderId: string, opts: { includeInStock?: boolean } = {}) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: { with: { product: true, variant: true } }, printJobs: true } });
  if (!order) return 0;
  const existing = new Set(order.printJobs.map((j) => j.orderItemId));
  const dueAt = addBusinessDays(order.paidAt ?? new Date(), order.productionDays);
  let created = 0;
  for (const item of order.items) {
    if (existing.has(item.id)) continue;
    const qty = opts.includeInStock ? item.quantity : item.quoteId ? item.quantity : item.toProduceQty;
    if (qty <= 0) continue;
    const p = item.product;
    await db.insert(printJobs).values({
      title: `${order.number} · ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""}`,
      orderId: order.id,
      orderItemId: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quoteId: item.quoteId,
      materialId: item.variant?.materialId ?? p?.materialId ?? null,
      quantity: qty,
      estimatedMinutes: (p?.printMinutes ?? 0) * qty,
      laborMinutes: (p?.laborMinutes ?? 15) * qty,
      estimatedGrams: (p?.materialGrams ?? 0) * qty,
      priority: item.quoteId ? 1 : 0,
      dueAt,
      notes: item.customization ? `Personalização: ${item.customization}` : null,
    });
    created++;
  }
  if (created > 0) {
    await db.insert(orderEvents).values({ orderId, type: "production", message: `${created} job(s) entraram na fila de produção · prazo alvo ${dueAt.toLocaleDateString("pt-BR")}` });
    if (order.status === "paid") await db.update(orders).set({ status: "in_production" }).where(eq(orders.id, orderId));
    clearBacklogCache();
  }
  return created;
}

// ---------------------------------------------------------------- ordenação e projeção

export type QueueJob = PrintJob & { order?: Order | null; product?: Product | null; variant?: ProductVariant | null };
export type ScheduledJob<T extends PrintJob = PrintJob> = T & { projectedFinish: Date; late: boolean; source: "order" | "quote" | "stock" | "manual" };

export function jobSource(j: PrintJob): ScheduledJob["source"] {
  if (j.orderId) return j.quoteId ? "quote" : "order";
  if (j.quoteId) return "quote";
  if (j.addsToStock) return "stock";
  return "manual";
}

/** Ordem de execução: imprimindo primeiro; depois prazo alvo (mais cedo primeiro; sem prazo por último), prioridade, chegada. */
export function orderQueue<T extends PrintJob>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    if (a.status !== b.status) return a.status === "printing" ? -1 : 1;
    const da = a.dueAt?.getTime() ?? Infinity;
    const dbb = b.dueAt?.getTime() ?? Infinity;
    if (da !== dbb) return da - dbb;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Simula a fila na capacidade configurada e projeta quando cada job termina (dias úteis a partir de hoje).
 * Máquinas em paralelo dividem os minutos de impressão; o pós-processo roda em fila única.
 */
export function scheduleQueue<T extends PrintJob>(jobs: T[], c: Capacity, now = new Date()): ScheduledJob<T>[] {
  const ordered = orderQueue(jobs);
  const machineDay = Math.max(60, c.hoursPerDay * 60 * Math.max(1, c.machines));
  const laborDay = Math.max(60, c.laborHoursPerDay * 60);
  let printAcc = 0;
  let laborAcc = 0;
  return ordered.map((j) => {
    printAcc += j.estimatedMinutes;
    laborAcc += j.laborMinutes;
    const days = Math.ceil(printAcc / machineDay) + Math.ceil(laborAcc / laborDay);
    const projectedFinish = addBusinessDays(now, Math.max(0, days - 1)); // termina dentro do dia útil N
    const late = !!j.dueAt && projectedFinish.getTime() > j.dueAt.getTime() + 12 * 3600_000;
    return { ...j, projectedFinish, late, source: jobSource(j) };
  });
}

// ---------------------------------------------------------------- sugestões para estoque saudável

export type StockSuggestion = {
  product: Product;
  variant: ProductVariant | null;
  stock: number;
  target: number;
  queued: number;
  shortfall: number;
  soldLast60: number;
  perDay: number;
  printMinutes: number;
  gramsNeeded: number;
  materialOk: boolean;
  materialName: string | null;
  reason: string;
};

/**
 * O que produzir quando a fila esvazia: produtos de catálogo abaixo do estoque saudável.
 * Alvo = targetStockQty do produto ou velocidade de venda (últimos 60 dias) × dias de cobertura; mínimo 1 para itens vendidos/destacados.
 * Desconta o que já está na fila e avisa se falta filamento.
 */
export async function suggestStockJobs(s: Settings, limit = 8): Promise<StockSuggestion[]> {
  const coverDays = Number(s.production_stock_cover_days) || 21;
  const since = new Date(Date.now() - 60 * 86400_000);
  const [prods, sold, queued] = await Promise.all([
    db.query.products.findMany({ where: and(eq(products.status, "active"), eq(products.kind, "stock")), with: { variants: true, material: true, bom: { with: { material: true } } } }),
    db
      .select({ productId: orderItems.productId, variantId: orderItems.variantId, qty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.paymentStatus, "approved"), gte(orders.paidAt, since)))
      .groupBy(orderItems.productId, orderItems.variantId),
    db.query.printJobs.findMany({ where: and(inArray(printJobs.status, ["queued", "printing"]), eq(printJobs.addsToStock, true)) }),
  ]);

  const out: StockSuggestion[] = [];
  for (const p of prods) {
    const units: { variant: ProductVariant | null; stock: number }[] = p.variants.length ? p.variants.map((v) => ({ variant: v, stock: v.stockQty })) : [{ variant: null, stock: p.stockQty }];
    const soldProduct = sold.filter((r) => r.productId === p.id).reduce((a, r) => a + Number(r.qty), 0);
    for (const u of units) {
      const soldUnit = u.variant ? Number(sold.find((r) => r.variantId === u.variant!.id)?.qty ?? 0) : soldProduct;
      const perDay = soldUnit / 60;
      const share = p.variants.length ? 1 / p.variants.length : 1;
      const explicitTarget = p.targetStockQty > 0 ? Math.max(1, Math.round(p.targetStockQty * share)) : 0;
      const velocityTarget = Math.ceil(perDay * coverDays);
      const baseline = soldUnit > 0 || p.featured || p.tags.includes("destaques") || p.tags.includes("mais-vendidos") ? 1 : 0;
      const target = explicitTarget || Math.max(velocityTarget, baseline);
      const inQueue = queued.filter((j) => j.productId === p.id && (u.variant ? j.variantId === u.variant.id : !j.variantId)).reduce((a, j) => a + j.quantity, 0);
      const shortfall = target - Math.max(0, u.stock) - inQueue;
      if (shortfall <= 0) continue;
      const gramsPerUnit = p.bom.length ? p.bom.reduce((a, l) => a + l.gramsPerUnit, 0) : p.materialGrams;
      const gramsNeeded = gramsPerUnit * shortfall;
      const mat = u.variant?.materialId ? null : (p.material ?? p.bom[0]?.material ?? null);
      const materialOk = mat ? mat.stockGrams >= gramsNeeded : true;
      out.push({
        product: p,
        variant: u.variant,
        stock: u.stock,
        target,
        queued: inQueue,
        shortfall,
        soldLast60: soldUnit,
        perDay,
        printMinutes: p.printMinutes * shortfall,
        gramsNeeded,
        materialOk,
        materialName: mat?.name ?? null,
        reason: u.stock < 0 ? "vendido sem estoque" : explicitTarget ? "abaixo do estoque saudável definido" : soldUnit > 0 ? `vende ~${(perDay * 7).toFixed(1)}/semana` : "destaque sem peça pronta",
      });
    }
  }
  // prioridade: estoque negativo, depois maior velocidade × faltando, depois margem
  out.sort((a, b) => (a.stock < 0 ? -1 : 0) - (b.stock < 0 ? -1 : 0) || b.perDay * b.shortfall - a.perDay * a.shortfall || (b.product.priceCents - b.product.costCents) - (a.product.priceCents - a.product.costCents));
  return out.slice(0, limit);
}

/** Orçamentos que a equipe ainda precisa responder (SLA em dias úteis). */
export async function quotesToAnswer(slaDays: number) {
  const list = await db.query.quotes.findMany({ where: inArray(quotes.status, ["new", "reviewing"]), orderBy: desc(quotes.createdAt), with: { customer: true } });
  return list.map((q) => {
    const dueAt = addBusinessDays(q.createdAt, slaDays);
    return { ...q, dueAt, overdue: dueAt.getTime() < Date.now() };
  });
}
