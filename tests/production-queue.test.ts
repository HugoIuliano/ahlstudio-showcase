import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { orders, printJobs, products } from "@/db/schema";
import { asGuest, asUser, expectRedirect } from "./ctx";
import { fd, makeProduct, makeUser } from "./factory";
import { addToCartAction } from "@/actions/cart";
import { placeOrderAction } from "@/actions/checkout";
import { updatePaymentStatusAction } from "@/actions/orders";
import { clearBacklogCache, enqueueOrderJobs, getBacklog, orderQueue, scheduleQueue, suggestStockJobs } from "@/lib/production-queue";
import { estimateProductionDays } from "@/lib/production";
import { SETTING_DEFAULTS, type Settings } from "@/lib/settings";

const settings = (over: Partial<Settings> = {}): Settings => ({ ...(SETTING_DEFAULTS as Settings), ...over });

describe("Fila de produção", () => {
  it("pedido pago entra na fila só com o que faltava em estoque; personalizado sempre; backlog cresce e puxa o prazo", async () => {
    clearBacklogCache();
    const before = await getBacklog();
    // com estoque > 0 o carrinho limita a quantidade ao estoque; sob demanda (estoque 0) tudo vai para a fila
    const { product } = await makeProduct({ stockQty: 0, printMinutes: 120 });
    asGuest();
    await expectRedirect(addToCartAction(fd({ productId: product.id, quantity: 3 })));
    await expectRedirect(placeOrderAction(null, fd({ name: "Fila Teste", email: "fila@teste.local", phone: "11999990000", shippingOptionId: "pickup", acceptTerms: "on" })));
    const order = (await db.query.orders.findFirst({ where: eq(orders.customerEmail, "fila@teste.local"), orderBy: desc(orders.createdAt), with: { items: true } }))!;
    expect(order.items[0].toProduceQty).toBe(3);
    expect(order.productionDays).toBeGreaterThanOrEqual(2); // 3 × 120 min + acabamento + embalagem

    // antes do pagamento nada entra
    expect(await db.query.printJobs.findMany({ where: eq(printJobs.orderId, order.id) })).toHaveLength(0);

    // pagamento manual aprovado → job com quantidade 3, prazo alvo e pedido em produção
    const admin = await makeUser("admin");
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    await updatePaymentStatusAction(fd({ id: order.id, paymentStatus: "approved" }));
    const jobs = await db.query.printJobs.findMany({ where: eq(printJobs.orderId, order.id) });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].quantity).toBe(3);
    expect(jobs[0].estimatedMinutes).toBe(360);
    expect(jobs[0].laborMinutes).toBe(30); // 10 min/un. padrão
    expect(jobs[0].dueAt).toBeTruthy();
    expect((await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))?.status).toBe("in_production");

    // idempotente
    expect(await enqueueOrderJobs(order.id)).toBe(0);

    // backlog reflete a fila e entra no prazo de novas vendas sob encomenda
    clearBacklogCache();
    const after = await getBacklog();
    expect(after.printMinutes - before.printMinutes).toBe(360);
    const opts = { hoursPerDay: 8, machines: 1, laborHoursPerDay: 4, handlingDays: 1 };
    const noQueue = estimateProductionDays([{ printMinutes: 480, laborMinutes: 0, quantity: 1, inStock: false }], opts);
    const withQueue = estimateProductionDays([{ printMinutes: 480, laborMinutes: 0, quantity: 1, inStock: false }], { ...opts, backlogPrintMinutes: 960 });
    expect(withQueue - noQueue).toBe(2);
    // item em estoque não sofre com a fila
    expect(estimateProductionDays([{ printMinutes: 480, quantity: 1, inStock: true }], { ...opts, backlogPrintMinutes: 9600 })).toBe(1);
  });

  it("ordena por prazo alvo e projeta atraso", () => {
    const base = { id: "", title: "", status: "queued" as const, priority: 0, orderId: null, orderItemId: null, quoteId: null, productId: null, variantId: null, printerId: null, materialId: null, quantity: 1, producedQty: null, failedQty: null, wasteGrams: null, estimatedMinutes: 480, laborMinutes: 0, actualMinutes: null, estimatedGrams: 0, actualGrams: null, addsToStock: false, startedAt: null, finishedAt: null, notes: null, createdAt: new Date(2026, 8, 1), updatedAt: new Date(2026, 8, 1) };
    const now = new Date(2026, 8, 14, 9); // segunda-feira
    const soon = new Date(2026, 8, 15, 12); // terça
    const later = new Date(2026, 9, 14, 12);
    const jobs = [
      { ...base, id: "sem-prazo", dueAt: null, createdAt: new Date(2026, 7, 1) },
      { ...base, id: "tarde", dueAt: later },
      { ...base, id: "urgente", dueAt: soon },
      { ...base, id: "imprimindo", status: "printing" as const, dueAt: later, estimatedMinutes: 960 },
    ];
    expect(orderQueue(jobs).map((j) => j.id)).toEqual(["imprimindo", "urgente", "tarde", "sem-prazo"]);
    const sched = scheduleQueue(jobs, { hoursPerDay: 8, machines: 1, laborHoursPerDay: 4 }, now);
    expect(sched.find((j) => j.id === "urgente")!.late).toBe(true); // 16 h imprimindo + 8 h dele = 3 dias → quarta, prazo é terça
    expect(sched.find((j) => j.id === "tarde")!.late).toBe(false);
    expect(sched.find((j) => j.id === "sem-prazo")!.late).toBe(false);
  });

  it("sugere fornadas para produtos abaixo do estoque saudável e desconta a fila", async () => {
    const { product } = await makeProduct({ stockQty: 1, printMinutes: 60 });
    await db.update(products).set({ targetStockQty: 6, name: `Alvo ${product.id.slice(0, 6)}` }).where(eq(products.id, product.id));
    let list = await suggestStockJobs(settings(), 50);
    let sg = list.find((x) => x.product.id === product.id)!;
    expect(sg).toBeTruthy();
    expect(sg.shortfall).toBe(5);
    expect(sg.reason).toMatch(/estoque saudável/);
    // fornada já na fila reduz a sugestão
    await db.insert(printJobs).values({ title: "fornada", productId: product.id, quantity: 3, addsToStock: true, estimatedMinutes: 180 });
    list = await suggestStockJobs(settings(), 50);
    sg = list.find((x) => x.product.id === product.id)!;
    expect(sg.shortfall).toBe(2);
    expect(sg.queued).toBe(3);
    // produto sem vendas, sem destaque e sem alvo não aparece
    const { product: quiet } = await makeProduct({ stockQty: 0 });
    expect((await suggestStockJobs(settings(), 100)).some((x) => x.product.id === quiet.id)).toBe(false);
  });
});
