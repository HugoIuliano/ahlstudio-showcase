import { and, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { assets, expenses, manualRevenues, materials, orders, printJobs, products, quotes, stockMovements, supplies, type ExpenseCategory, type RevenueLine } from "@/db/schema";
import type { Settings } from "./settings";

/**
 * Motor financeiro: DRE mensal, EBITDA, valuation de estoque e forecast.
 * Tudo em centavos; períodos em meses fechados (início inclusivo, fim exclusivo).
 */
export type Period = { start: Date; end: Date; label: string; key: string };

export function monthPeriod(d: Date): Period {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start, end, key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`, label: start.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }) };
}
export function lastMonths(n: number, from = new Date()): Period[] {
  return Array.from({ length: n }, (_, i) => monthPeriod(new Date(from.getFullYear(), from.getMonth() - (n - 1 - i), 1)));
}
export function parseMonthKey(key?: string | null): Date {
  const m = key?.match(/^(\d{4})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date();
}

export type PnL = {
  period: Period;
  revenue: { byLine: Record<RevenueLine, number>; shippingCents: number; grossCents: number; ordersCount: number };
  deductions: { feesCents: number; taxesCents: number; netCents: number };
  cogs: { productsCents: number; wasteCents: number; shippingCents: number; expensesCents: number; manualCents: number; totalCents: number };
  grossMarginCents: number;
  grossMarginPct: number;
  opex: { byCategory: Partial<Record<ExpenseCategory, number>>; totalCents: number };
  ebitdaCents: number;
  ebitdaPct: number;
  depreciationCents: number;
  resultCents: number;
};

/** Despesas contabilizadas no período: avulsas com date dentro + recorrentes ativas no mês. */
export async function expensesInPeriod(p: Period) {
  const oneOff = await db.query.expenses.findMany({ where: and(eq(expenses.recurring, false), gte(expenses.date, p.start), lt(expenses.date, p.end)) });
  const recurring = await db.query.expenses.findMany({ where: and(eq(expenses.recurring, true), lt(expenses.date, p.end), or(sql`${expenses.endDate} is null`, gte(expenses.endDate, p.start))) });
  return [...oneOff, ...recurring];
}

/** Depreciação linear dos ativos ativos no mês. */
export async function depreciationInPeriod(p: Period) {
  const list = await db.query.assets.findMany({ where: and(lt(assets.purchaseDate, p.end), or(sql`${assets.disposedAt} is null`, gte(assets.disposedAt, p.start))) });
  let total = 0;
  for (const a of list) {
    const end = new Date(a.purchaseDate.getFullYear(), a.purchaseDate.getMonth() + a.usefulLifeMonths, 1);
    if (end <= p.start) continue; // já totalmente depreciado
    total += Math.round((a.amountCents - a.salvageCents) / a.usefulLifeMonths);
  }
  return total;
}

export async function computePnL(p: Period, s: Settings): Promise<PnL> {
  const paid = await db.query.orders.findMany({
    where: and(eq(orders.paymentStatus, "approved"), gte(orders.paidAt, p.start), lt(orders.paidAt, p.end)),
    with: { items: { with: { product: true } } },
  });
  const byLine: Record<RevenueLine, number> = { catalog: 0, custom: 0, service: 0, event: 0, wholesale: 0, other: 0 };
  let shippingCents = 0;
  let shippingCogs = 0; // etiquetas SuperFrete/Melhor Envio e custo da entrega local (snapshot no pedido)
  let productsCogs = 0;
  let fees = 0;
  for (const o of paid) {
    shippingCents += o.shippingCents;
    shippingCogs += o.shippingCostCents;
    for (const i of o.items) {
      if (i.quoteId) byLine.custom += i.totalCents;
      else byLine.catalog += i.totalCents;
      // snapshot do custo no pedido; fallback para o custo atual do produto em pedidos antigos
      if (!i.quoteId) productsCogs += (i.unitCostCents ?? i.product?.costCents ?? 0) * i.quantity;
    }
    const feePct = o.paymentMethod === "mercadopago" ? Number(s.fee_card_pct) : o.paymentMethod === "pix_manual" ? 0 : Number(s.fee_pix_pct);
    fees += Math.round((o.totalCents * feePct) / 100);
  }
  // COGS dos personalizados: snapshot no item; fallback para o custo do orçamento
  const legacyCustom = paid.flatMap((o) => o.items.filter((i) => i.quoteId && i.unitCostCents == null).map((i) => i.quoteId!));
  for (const o of paid) for (const i of o.items) if (i.quoteId && i.unitCostCents != null) productsCogs += i.unitCostCents;
  if (legacyCustom.length) {
    const qs = await db.query.quotes.findMany({ where: inArray(quotes.id, legacyCustom), columns: { costCents: true } });
    productsCogs += qs.reduce((a, q) => a + (q.costCents ?? 0), 0);
  }
  const manual = await db.query.manualRevenues.findMany({ where: and(gte(manualRevenues.date, p.start), lt(manualRevenues.date, p.end)) });
  let manualCogs = 0;
  for (const r of manual) {
    byLine[r.line] += r.amountCents;
    manualCogs += r.costCents;
  }
  const grossCents = Object.values(byLine).reduce((a, b) => a + b, 0) + shippingCents;
  const taxesCents = Math.round((grossCents * Number(s.tax_pct)) / 100);
  const netCents = grossCents - fees - taxesCents;

  // desperdício de filamento no período (valorado ao custo atual do material)
  const waste = await db.query.stockMovements.findMany({ where: and(eq(stockMovements.reason, "waste"), gte(stockMovements.createdAt, p.start), lt(stockMovements.createdAt, p.end)), with: { material: true } });
  const wasteCents = waste.reduce((a, m) => a + Math.round((Math.abs(m.deltaGrams) / 1000) * m.material.costPerKgCents), 0);

  const exp = await expensesInPeriod(p);
  const cogsExpenses = exp.filter((e) => e.kind === "cogs").reduce((a, e) => a + e.amountCents, 0);
  const opexList = exp.filter((e) => e.kind === "opex");
  const byCategory: Partial<Record<ExpenseCategory, number>> = {};
  for (const e of opexList) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountCents;
  const opexTotal = opexList.reduce((a, e) => a + e.amountCents, 0);

  const cogsTotal = productsCogs + wasteCents + shippingCogs + cogsExpenses + manualCogs;
  const grossMarginCents = netCents - cogsTotal;
  const ebitdaCents = grossMarginCents - opexTotal;
  const depreciationCents = await depreciationInPeriod(p);
  return {
    period: p,
    revenue: { byLine, shippingCents, grossCents, ordersCount: paid.length },
    deductions: { feesCents: fees, taxesCents, netCents },
    cogs: { productsCents: productsCogs, wasteCents, shippingCents: shippingCogs, expensesCents: cogsExpenses, manualCents: manualCogs, totalCents: cogsTotal },
    grossMarginCents,
    grossMarginPct: netCents > 0 ? (grossMarginCents / netCents) * 100 : 0,
    opex: { byCategory, totalCents: opexTotal },
    ebitdaCents,
    ebitdaPct: netCents > 0 ? (ebitdaCents / netCents) * 100 : 0,
    depreciationCents,
    resultCents: ebitdaCents - depreciationCents,
  };
}

/** Valor de estoque: produtos (ao custo), filamento e insumos. */
export async function inventoryValuation() {
  const prods = await db.query.products.findMany({ where: eq(products.kind, "stock"), with: { variants: true } });
  let productUnits = 0;
  let productCents = 0;
  for (const p of prods) {
    const qty = Math.max(0, p.variants.length ? p.variants.reduce((a, v) => a + v.stockQty, 0) : p.stockQty);
    productUnits += qty;
    productCents += qty * p.costCents;
  }
  const mats = await db.query.materials.findMany({ where: eq(materials.active, true) });
  const materialGrams = mats.reduce((a, m) => a + Math.max(0, m.stockGrams), 0);
  const materialCents = mats.reduce((a, m) => a + Math.round((Math.max(0, m.stockGrams) / 1000) * m.costPerKgCents), 0);
  const sups = await db.query.supplies.findMany({ where: eq(supplies.active, true) });
  const supplyCents = sups.reduce((a, s) => a + Math.round(Math.max(0, s.qty) * s.unitCostCents), 0);
  const lowMaterials = mats.filter((m) => m.stockGrams <= m.minStockGrams);
  const lowSupplies = sups.filter((s) => s.qty <= s.minQty);
  return { productUnits, productCents, materialGrams, materialCents, supplyCents, totalCents: productCents + materialCents + supplyCents, lowMaterials, lowSupplies };
}

/** Pipeline comercial ponderado + projeção do mês + consumo de material da fila. */
export async function forecast(s: Settings) {
  const now = new Date();
  const month = monthPeriod(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();

  const pendingOrders = await db.query.orders.findMany({ where: eq(orders.status, "pending_payment"), orderBy: desc(orders.createdAt) });
  const quoted = await db.query.quotes.findMany({ where: and(eq(quotes.status, "quoted"), or(sql`${quotes.validUntil} is null`, gte(quotes.validUntil, now))), with: { customer: true }, orderBy: desc(quotes.updatedAt) });
  const reviewing = await db.query.quotes.findMany({ where: inArray(quotes.status, ["new", "reviewing"]), orderBy: desc(quotes.createdAt) });
  const approvedUnpaid = await db.query.quotes.findMany({ where: eq(quotes.status, "approved"), with: { customer: true } });

  const pPending = Number(s.prob_pending_payment);
  const pQuoted = Number(s.prob_quoted);
  const pendingCents = pendingOrders.reduce((a, o) => a + o.totalCents, 0);
  const quotedCents = quoted.reduce((a, q) => a + (q.priceCents ?? 0), 0);
  const weightedCents = Math.round(pendingCents * pPending + quotedCents * pQuoted);

  // run-rate: média diária dos últimos 90 dias pagos
  const since = new Date(now.getTime() - 90 * 86400000);
  const [{ total90 }] = await db.select({ total90: sql<number>`coalesce(sum(${orders.totalCents}),0)` }).from(orders).where(and(eq(orders.paymentStatus, "approved"), gte(orders.paidAt, since)));
  const dailyRunRate = Math.round(total90 / 90);
  const [{ mtd }] = await db.select({ mtd: sql<number>`coalesce(sum(${orders.totalCents}),0)` }).from(orders).where(and(eq(orders.paymentStatus, "approved"), gte(orders.paidAt, month.start), lte(orders.paidAt, now)));
  const projectedMonthCents = mtd + dailyRunRate * (daysInMonth - dayOfMonth) + Math.round(pendingCents * pPending);

  // consumo de material previsto pela fila + orçamentos aprovados
  const queue = await db.query.printJobs.findMany({ where: inArray(printJobs.status, ["queued", "printing"]), with: { material: true } });
  const gramsByMaterial = new Map<string, { name: string; grams: number; stockGrams: number; costPerKgCents: number }>();
  for (const j of queue) {
    if (!j.material) continue;
    const cur = gramsByMaterial.get(j.material.id) ?? { name: j.material.name, grams: 0, stockGrams: j.material.stockGrams, costPerKgCents: j.material.costPerKgCents };
    cur.grams += j.estimatedGrams;
    gramsByMaterial.set(j.material.id, cur);
  }
  const queueMinutes = queue.reduce((a, j) => a + j.estimatedMinutes, 0);

  // caixa 30 dias: entradas ponderadas − OPEX recorrente do próximo mês
  const nextMonth = monthPeriod(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const recurring = await db.query.expenses.findMany({ where: and(eq(expenses.recurring, true), lt(expenses.date, nextMonth.end), or(sql`${expenses.endDate} is null`, gte(expenses.endDate, nextMonth.start))) });
  const recurringCents = recurring.reduce((a, e) => a + e.amountCents, 0);
  const cash30 = weightedCents + dailyRunRate * 30 - recurringCents;

  return {
    pendingOrders, quoted, reviewing, approvedUnpaid,
    pendingCents, quotedCents, weightedCents, pPending, pQuoted,
    dailyRunRate, mtd, projectedMonthCents, daysLeft: daysInMonth - dayOfMonth,
    materialNeeds: [...gramsByMaterial.values()].map((m) => ({ ...m, shortfallGrams: Math.max(0, m.grams - m.stockGrams) })),
    queueMinutes, recurringCents, cash30,
  };
}
