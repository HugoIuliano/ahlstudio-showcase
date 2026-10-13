import { calcPrice, type PricingBreakdown } from "./pricing";

/**
 * Ficha técnica (BOM) e custo de produção de um produto.
 * Usado no formulário do produto (client) e nas actions (server) — só funções puras.
 */
export type BomLine = { materialId: string; gramsPerUnit: number; note?: string | null };
export type MaterialCost = { id: string; costPerKgCents: number };

export function bomGrams(bom: BomLine[]) {
  return bom.reduce((s, l) => s + (Number(l.gramsPerUnit) || 0), 0);
}

/** Custo de material por unidade somando cada filamento da BOM pelo seu preço/kg atual. */
export function bomMaterialCents(bom: BomLine[], materials: MaterialCost[]) {
  return bom.reduce((s, l) => {
    const m = materials.find((x) => x.id === l.materialId);
    return s + Math.round(((Number(l.gramsPerUnit) || 0) / 1000) * (m?.costPerKgCents ?? 0));
  }, 0);
}

export type UnitCostInput = {
  bom: BomLine[];
  materials: MaterialCost[];
  printMinutes: number;
  printerHourlyCents: number;
  laborMinutes?: number;
  laborHourlyCents: number;
  failureRate: number;
  marginPct: number;
  extraCents?: number;
};

/** Custo unitário completo (material + máquina + mão de obra + refugo) e preço sugerido. */
export function unitCost(i: UnitCostInput): PricingBreakdown {
  return calcPrice({
    materialGrams: bomGrams(i.bom),
    materialCostPerKgCents: 0,
    materialCents: bomMaterialCents(i.bom, i.materials),
    printMinutes: i.printMinutes,
    printerHourlyCostCents: i.printerHourlyCents,
    laborMinutes: i.laborMinutes ?? 10,
    laborHourlyCents: i.laborHourlyCents,
    failureRate: i.failureRate,
    marginPct: i.marginPct,
    extraCents: i.extraCents ?? 0,
  });
}

/** Parse seguro do JSON enviado pelo formulário do produto. */
export function parseBom(raw: string | null | undefined): BomLine[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((l) => ({ materialId: String(l.materialId ?? ""), gramsPerUnit: Math.max(0, Math.round(Number(l.gramsPerUnit) || 0)), note: l.note ? String(l.note) : null }))
      .filter((l) => l.materialId && l.gramsPerUnit > 0);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- prazo de produção

export type LeadTimeItem = { printMinutes: number; laborMinutes?: number; quantity: number; inStock: boolean };

/**
 * Dias úteis até o pedido estar pronto para postar/retirar.
 * Itens em estoque só precisam do prazo de embalagem/postagem. Itens a produzir somam duas filas em sequência:
 *  - impressão: minutos de máquina ÷ (horas/dia × máquinas em paralelo)
 *  - pós-processamento (lixar, montar, embalar): minutos de mão de obra ÷ horas/dia de pessoa
 * cada uma arredondada para cima, mais a embalagem/postagem.
 * O backlog da fila (minutos já comprometidos com outros pedidos) entra na frente do que precisa ser feito.
 */
export function estimateProductionDays(items: LeadTimeItem[], opts: { hoursPerDay: number; machines: number; laborHoursPerDay?: number; handlingDays: number; backlogPrintMinutes?: number; backlogLaborMinutes?: number }) {
  const handling = Math.max(0, Math.round(opts.handlingDays) || 0);
  const toMake = items.filter((i) => !i.inStock);
  const ownPrint = toMake.reduce((s, i) => s + Math.max(0, i.printMinutes || 0) * Math.max(1, i.quantity), 0);
  const ownLabor = toMake.reduce((s, i) => s + Math.max(0, i.laborMinutes || 0) * Math.max(1, i.quantity), 0);
  if (ownPrint === 0 && ownLabor === 0) return handling;
  const minutesToPrint = ownPrint + Math.max(0, opts.backlogPrintMinutes ?? 0);
  const minutesOfLabor = ownLabor + Math.max(0, opts.backlogLaborMinutes ?? 0);
  const machineCapacity = Math.max(60, (opts.hoursPerDay || 8) * 60 * Math.max(1, opts.machines || 1));
  const laborCapacity = Math.max(60, (opts.laborHoursPerDay || 4) * 60);
  return Math.ceil(minutesToPrint / machineCapacity) + Math.ceil(minutesOfLabor / laborCapacity) + handling;
}

/** Soma dias úteis (seg–sex) a uma data. */
export function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d;
}
