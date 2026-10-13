/** Motor financeiro: DRE/EBITDA, depreciação, recorrência, forecast, almoxarifado. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { assets, expenses, manualRevenues, orderItems, orders, printJobs, products, productSupplies, supplies, supplyMovements } from "@/db/schema";
import { computePnL, depreciationInPeriod, forecast, inventoryValuation, lastMonths, monthPeriod } from "@/lib/finance";
import { SETTING_DEFAULTS, type Settings } from "@/lib/settings";
import { addSupplyMovementAction, saveAssetAction, saveExpenseAction, saveProductSuppliesAction, saveSupplyAction } from "@/actions/finance";
import { createStockBatchAction, setPrintJobStatusAction } from "@/actions/erp";
import { asUser, resetCtx } from "./ctx";
import { fd, makeMaterial, makePrinter, makeProduct, makeUser } from "./factory";

const settings: Settings = { ...SETTING_DEFAULTS, fee_card_pct: "5", fee_pix_pct: "1", tax_pct: "6", prob_quoted: "0.5", prob_pending_payment: "0.7" };
beforeEach(() => resetCtx());

async function paidOrder(email: string, items: { productId: string; qty: number; price: number; cost: number }[], paidAt: Date, paymentMethod: "mercadopago" | "pix_manual" = "mercadopago") {
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  const [o] = await db.insert(orders).values({ number: `T-${Math.random().toString(36).slice(2, 7)}`, status: "paid", paymentStatus: "approved", paymentMethod, shippingMethod: "pickup", subtotalCents: subtotal, totalCents: subtotal, customerName: "T", customerEmail: email, paidAt, createdAt: paidAt }).returning();
  await db.insert(orderItems).values(items.map((i) => ({ orderId: o.id, productId: i.productId, name: "item", quantity: i.qty, unitPriceCents: i.price, unitCostCents: i.cost, totalCents: i.price * i.qty })));
  return o;
}

describe("DRE mensal", () => {
  it("calcula receita, taxas, impostos, COGS (snapshot), OPEX, EBITDA e depreciação", async () => {
    const p = monthPeriod(new Date(2030, 0, 15)); // mês isolado no futuro para não misturar com outros testes
    const { product } = await makeProduct({ priceCents: 10000, costCents: 3000 });
    await paidOrder("dre@teste.local", [{ productId: product.id, qty: 2, price: 10000, cost: 3000 }], new Date(2030, 0, 10)); // 200,00 cartão
    await paidOrder("dre2@teste.local", [{ productId: product.id, qty: 1, price: 10000, cost: 3000 }], new Date(2030, 0, 20), "pix_manual"); // 100,00 pix manual (sem taxa)
    // editar o custo do produto depois NÃO muda o COGS histórico
    await db.update(products).set({ costCents: 9999 }).where(eq(products.id, product.id));
    await db.insert(expenses).values([
      { description: "cloud", category: "cloud", kind: "opex", amountCents: 2000, recurring: true, date: new Date(2029, 11, 1) },
      { description: "energia", category: "energy", kind: "cogs", amountCents: 5000, date: new Date(2030, 0, 5) },
      { description: "fora do mês", category: "marketing", kind: "opex", amountCents: 99999, date: new Date(2030, 1, 5) },
      { description: "recorrente encerrada", category: "software", kind: "opex", amountCents: 77777, recurring: true, date: new Date(2029, 0, 1), endDate: new Date(2029, 5, 1) },
    ]);
    await db.insert(assets).values({ name: "máquina", category: "machine", amountCents: 360000, purchaseDate: new Date(2029, 6, 1), usefulLifeMonths: 36, salvageCents: 0 });
    await db.insert(manualRevenues).values({ description: "feira", line: "event", amountCents: 30000, costCents: 10000, date: new Date(2030, 0, 12) });

    const pnl = await computePnL(p, settings);
    expect(pnl.revenue.byLine.catalog).toBe(30000);
    expect(pnl.revenue.byLine.event).toBe(30000);
    expect(pnl.revenue.grossCents).toBe(60000);
    expect(pnl.deductions.feesCents).toBe(1000); // 5% de 200,00 (só o cartão)
    expect(pnl.deductions.taxesCents).toBe(3600); // 6% de 600,00
    expect(pnl.deductions.netCents).toBe(60000 - 1000 - 3600);
    expect(pnl.cogs.productsCents).toBe(9000); // 3 × 30,00 (snapshot), não 99,99
    expect(pnl.cogs.expensesCents).toBe(5000);
    expect(pnl.cogs.manualCents).toBe(10000);
    expect(pnl.opex.totalCents).toBe(2000); // só a recorrente ativa
    expect(pnl.opex.byCategory.cloud).toBe(2000);
    expect(pnl.grossMarginCents).toBe(pnl.deductions.netCents - 24000);
    expect(pnl.ebitdaCents).toBe(pnl.grossMarginCents - 2000);
    expect(pnl.depreciationCents).toBe(10000); // 3600/36
    expect(pnl.resultCents).toBe(pnl.ebitdaCents - 10000);
    expect(await depreciationInPeriod(monthPeriod(new Date(2033, 0, 1)))).toBe(0); // após a vida útil
  });

  it("lastMonths devolve meses contíguos terminando no mês pedido", () => {
    const ms = lastMonths(3, new Date(2030, 2, 10));
    expect(ms.map((m) => m.key)).toEqual(["2030-01", "2030-02", "2030-03"]);
  });
});

describe("Forecast", () => {
  it("pondera pedidos pendentes e orçamentos enviados e lista necessidade de material da fila", async () => {
    const mat = await makeMaterial({ stockGrams: 100 });
    const { product } = await makeProduct({ materialId: mat.id, gramsPerUnit: 50, printMinutes: 30 });
    const [o] = await db.insert(orders).values({ number: `F-${Date.now()}`, status: "pending_payment", paymentStatus: "pending", paymentMethod: "pix_manual", shippingMethod: "pickup", subtotalCents: 10000, totalCents: 10000, customerName: "F", customerEmail: "f@teste.local" }).returning();
    await db.insert(printJobs).values({ title: "fila", status: "queued", productId: product.id, materialId: mat.id, quantity: 4, estimatedGrams: 200, estimatedMinutes: 120 });
    const f = await forecast(settings);
    expect(f.pendingCents).toBeGreaterThanOrEqual(10000);
    expect(f.weightedCents).toBeGreaterThanOrEqual(7000);
    const need = f.materialNeeds.find((m) => m.name === mat.name);
    expect(need?.grams).toBe(200);
    expect(need?.shortfallGrams).toBe(100);
    expect(f.pendingOrders.some((x) => x.id === o.id)).toBe(true);
  });
});

describe("Almoxarifado", () => {
  it("insumo na ficha técnica é baixado na fornada e entra no valor de estoque; compra lança COGS", async () => {
    const admin = await makeUser("admin");
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    expect((await saveSupplyAction(null, fd({ name: "Caixa teste", category: "packaging", unit: "un", unitCost: "2,00", minQty: 5, initialQty: 20 })))?.ok).toBe(true);
    const sup = (await db.query.supplies.findFirst({ where: eq(supplies.name, "Caixa teste") }))!;
    expect(sup.qty).toBe(20);

    const { product } = await makeProduct({ gramsPerUnit: 10 });
    await saveProductSuppliesAction(fd({ productId: product.id, lines: JSON.stringify([{ supplyId: sup.id, qtyPerUnit: 1 }]) }));
    expect(await db.query.productSupplies.findFirst({ where: eq(productSupplies.productId, product.id) })).toBeTruthy();

    const printer = await makePrinter();
    await createStockBatchAction(fd({ productId: product.id, quantity: 5, printerId: printer.id }));
    const job = (await db.query.printJobs.findFirst({ where: eq(printJobs.productId, product.id) }))!;
    await setPrintJobStatusAction(fd({ id: job.id, status: "printing" }));
    await setPrintJobStatusAction(fd({ id: job.id, status: "done", producedQty: 4, failedQty: 1, wasteGrams: 0 }));
    const after = (await db.query.supplies.findFirst({ where: eq(supplies.id, sup.id) }))!;
    expect(after.qty).toBe(15); // 5 unidades produzidas (4 boas + 1 perdida) consomem 5 caixas
    const mv = await db.query.supplyMovements.findMany({ where: eq(supplyMovements.supplyId, sup.id) });
    expect(mv.some((m) => m.reason === "use" && m.delta === -5)).toBe(true);

    const before = await inventoryValuation();
    expect((await addSupplyMovementAction(null, fd({ supplyId: sup.id, reason: "purchase", delta: 10, unitCost: "2,50" })))?.ok).toBe(true);
    const afterBuy = await inventoryValuation();
    expect(afterBuy.supplyCents).toBeGreaterThan(before.supplyCents);
    const exp = await db.query.expenses.findMany({ where: eq(expenses.category, "supplies") });
    expect(exp.some((e) => e.kind === "cogs" && e.amountCents === 2500)).toBe(true);
  });

  it("despesa recorrente e CAPEX passam pela validação e ficam com kind padrão da categoria", async () => {
    const admin = await makeUser("admin");
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    expect((await saveExpenseAction(null, fd({ description: "Aluguel", category: "rent", amount: "600,00", date: "2030-05-01", recurring: "on" })))?.ok).toBe(true);
    const e = (await db.query.expenses.findFirst({ where: eq(expenses.description, "Aluguel") }))!;
    expect(e.kind).toBe("opex");
    expect(e.recurring).toBe(true);
    expect((await saveExpenseAction(null, fd({ description: "zero", category: "rent", amount: "0" })))?.error).toMatch(/maior que zero/);
    expect((await saveAssetAction(null, fd({ name: "PC", category: "computer", amount: "4.000,00", purchaseDate: "2030-05-01", usefulLifeMonths: 48, salvage: "400,00" })))?.ok).toBe(true);
    const a = (await db.query.assets.findFirst({ where: eq(assets.name, "PC") }))!;
    expect(a.amountCents).toBe(400000);
    expect(await depreciationInPeriod(monthPeriod(new Date(2030, 6, 1)))).toBeGreaterThanOrEqual(7500); // (4000-400)/48
    // atendimento não lança despesa
    const sup = await makeUser("support");
    asUser({ id: sup.id, email: sup.email!, role: "support" });
    await expect(saveExpenseAction(null, fd({ description: "x", category: "rent", amount: "1,00" }))).rejects.toThrow();
  });
});
