/**
 * Calculadora de custo de impressão 3D.
 * Usada no admin (produtos e orçamentos) para sugerir preço a partir do ERP.
 */
export type PricingInput = {
  materialGrams: number;
  materialCostPerKgCents: number;
  /** Se informado, substitui o cálculo grams × custo/kg (usado pela BOM multi-material). */
  materialCents?: number;
  printMinutes: number;
  printerHourlyCostCents: number; // energia + depreciação + manutenção
  laborMinutes?: number;
  laborHourlyCents?: number; // pós-processamento, embalagem
  extraCents?: number; // insertos, parafusos, embalagem
  failureRate?: number; // 0.1 = 10% de refugo
  marginPct?: number; // 0.6 = 60% sobre o custo
};

export type PricingBreakdown = {
  materialCents: number;
  machineCents: number;
  laborCents: number;
  extraCents: number;
  failureCents: number;
  costCents: number;
  suggestedPriceCents: number;
};

export function calcPrice(i: PricingInput): PricingBreakdown {
  const materialCents = i.materialCents ?? Math.round((i.materialGrams / 1000) * i.materialCostPerKgCents);
  const machineCents = Math.round((i.printMinutes / 60) * i.printerHourlyCostCents);
  const laborCents = Math.round(((i.laborMinutes ?? 0) / 60) * (i.laborHourlyCents ?? 0));
  const extraCents = i.extraCents ?? 0;
  const base = materialCents + machineCents + laborCents + extraCents;
  const failureCents = Math.round(base * (i.failureRate ?? 0));
  const costCents = base + failureCents;
  const suggestedPriceCents = roundToNine(Math.round(costCents * (1 + (i.marginPct ?? 0))));
  return { materialCents, machineCents, laborCents, extraCents, failureCents, costCents, suggestedPriceCents };
}

/** Arredonda para terminar em ,90 (preço psicológico), mínimo R$ 4,90 */
function roundToNine(cents: number) {
  const reais = Math.max(4, Math.ceil(cents / 100));
  return reais * 100 - 10;
}
