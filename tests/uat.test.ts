/**
 * UAT ampliado: conta do cliente (perfil/endereços), frete (cotação pública, seleção, admin), fila, máquinas,
 * checkout com endereço salvo, LGPD (export inclui endereços) e RBAC das novas actions.
 */
import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { addresses, orders, printers, printJobs, shippingZones, users } from "@/db/schema";
import { asGuest, asUser, ctx, expectRedirect, resetCtx } from "./ctx";
import { fd, makePrinter, makeProduct, makeUser } from "./factory";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction, updateProfileAction } from "@/actions/account";
import { addToCartAction } from "@/actions/cart";
import { placeOrderAction } from "@/actions/checkout";
import { deletePrinterAction } from "@/actions/erp";
import { updateOrderNotesAction } from "@/actions/orders";
import { quoteForCepAction, saveShippingSettingsAction, saveZoneAction, seedDefaultZonesAction, selectShippingOptionAction } from "@/actions/shipping";
import { readShippingPref } from "@/lib/shipping-pref";

beforeEach(() => resetCtx());

describe("Conta do cliente: perfil e endereços", () => {
  it("atualiza WhatsApp/documento com validação e mantém escopo por usuário", async () => {
    const u = await makeUser("customer");
    asUser({ id: u.id, email: u.email!, role: "customer" });
    expect((await updateProfileAction(null, fd({ name: "Hugo Teste", phone: "1999" })))?.error).toMatch(/WhatsApp/);
    expect((await updateProfileAction(null, fd({ name: "Hugo Teste", phone: "(19) 99999-0000", document: "123" })))?.error).toMatch(/CPF/);
    expect((await updateProfileAction(null, fd({ name: "Hugo Teste", phone: "(19) 99999-0000", document: "123.456.789-09" })))?.ok).toBe(true);
    const saved = await db.query.users.findFirst({ where: eq(users.id, u.id) });
    expect(saved?.phone).toBe("(19) 99999-0000");
    expect(saved?.document).toBe("12345678909");

    // endereços: primeiro vira principal; CEP inválido rejeitado; ViaCEP não é chamado aqui
    expect((await saveAddressAction(null, fd({ zip: "123", street: "Rua A", number: "1", city: "Americana", state: "SP" })))?.error).toMatch(/CEP/);
    expect((await saveAddressAction(null, fd({ label: "Casa", zip: "13470-100", street: "Rua dos Testes", number: "10", city: "Americana", state: "sp" })))?.ok).toBe(true);
    expect((await saveAddressAction(null, fd({ label: "Trabalho", zip: "13465-000", street: "Av. Brasil", number: "200", city: "Americana", state: "SP", isDefault: "on" })))?.ok).toBe(true);
    let mine = await db.query.addresses.findMany({ where: eq(addresses.userId, u.id) });
    expect(mine).toHaveLength(2);
    expect(mine.find((a) => a.label === "Trabalho")?.isDefault).toBe(true);
    expect(mine.find((a) => a.label === "Casa")?.isDefault).toBe(false);
    expect(mine.find((a) => a.label === "Casa")?.state).toBe("SP");

    // outro usuário não consegue editar/apagar/tornar principal um endereço que não é dele
    const other = await makeUser("customer");
    const casa = mine.find((a) => a.label === "Casa")!;
    asUser({ id: other.id, email: other.email!, role: "customer" });
    expect((await saveAddressAction(null, fd({ id: casa.id, zip: "13470-100", street: "Hackeada", number: "1", city: "Outra", state: "SP" })))?.error).toMatch(/não encontrado/);
    await deleteAddressAction(fd({ id: casa.id }));
    await setDefaultAddressAction(fd({ id: casa.id }));
    expect(await db.query.addresses.findFirst({ where: eq(addresses.id, casa.id) })).toBeTruthy();

    // dono apaga a principal → a restante vira principal
    asUser({ id: u.id, email: u.email!, role: "customer" });
    const trabalho = mine.find((a) => a.label === "Trabalho")!;
    await deleteAddressAction(fd({ id: trabalho.id }));
    mine = await db.query.addresses.findMany({ where: eq(addresses.userId, u.id) });
    expect(mine).toHaveLength(1);
    expect(mine[0].isDefault).toBe(true);

    // visitante não acessa
    asGuest();
    await expect(updateProfileAction(null, fd({ name: "X" }))).rejects.toThrow(/login/i);
  });
});

describe("Frete: cotação pública, seleção e administração", () => {
  it("cotação pública não vaza custo interno, grava CEP no cookie e a seleção persiste", async () => {
    const { product } = await makeProduct({ stockQty: 3 });
    asGuest();
    await expectRedirect(addToCartAction(fd({ productId: product.id, quantity: 1 })));
    expect((await quoteForCepAction("1234")).error).toMatch(/CEP/);
    const q = await quoteForCepAction("13470-100");
    expect(q.error).toBeUndefined();
    expect(q.options.length).toBeGreaterThan(0);
    expect(q.options.every((o) => !("costCents" in o))).toBe(true);
    expect((await readShippingPref()).cep).toBe("13470100");
    const pick = q.options.find((o) => o.method !== "pickup") ?? q.options[0];
    await selectShippingOptionAction(fd({ optionId: pick.id }));
    expect((await readShippingPref()).optionId).toBe(pick.id);

    // cotação avulsa de produto (página do produto) funciona sem carrinho e respeita estoque (produção 0 → só embalagem)
    const single = await quoteForCepAction("13470100", { productId: product.id, quantity: 1 });
    expect(single.options.find((o) => o.id === "pickup")).toBeTruthy();
    expect(single.productionDays).toBeGreaterThanOrEqual(0);
  });

  it("RBAC: só quem tem settings.manage mexe em zonas/regras; validações de faixa", async () => {
    const sup = await makeUser("support");
    asUser({ id: sup.id, email: sup.email!, role: "support" });
    await expect(saveZoneAction(null, fd({ name: "Zona X", cepStart: "13000000", cepEnd: "13999999", price: "10,00" }))).rejects.toThrow(/Não autorizado/);
    await expect(seedDefaultZonesAction()).rejects.toThrow(/Não autorizado/);
    await expect(saveShippingSettingsAction(null, fd({ shipping_origin_cep: "13473020" }))).rejects.toThrow(/Não autorizado/);

    const admin = await makeUser("admin");
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    expect((await saveZoneAction(null, fd({ name: "Zona invertida", cepStart: "13999999", cepEnd: "13000000", price: "10,00" })))?.error).toMatch(/inicial maior/);
    expect((await saveZoneAction(null, fd({ name: "Zona curta", cepStart: "1300", cepEnd: "13999999", price: "10,00" })))?.error).toMatch(/inválida|CEP/);
    const before = (await db.query.shippingZones.findMany()).length;
    await seedDefaultZonesAction();
    await seedDefaultZonesAction(); // idempotente
    const after = (await db.query.shippingZones.findMany()).length;
    expect(after).toBeGreaterThanOrEqual(before);
    expect((await db.query.shippingZones.findMany()).filter((z) => z.cepStart === 13465000)).toHaveLength(1);
    expect((await saveShippingSettingsAction(null, fd({ shipping_origin_cep: "abc" })))?.error).toMatch(/origem/);
    // checkboxes ausentes = desligado (como no formulário); aqui mantemos os 3 canais ligados
    expect((await saveShippingSettingsAction(null, fd({ shipping_origin_cep: "13473-020", shipping_pkg_dims_cm: "16x12x6", shipping_provider: "none", shipping_correios_cents: "25,00", shipping_pickup_enabled: "on", shipping_delivery_enabled: "on", shipping_correios_enabled: "on" })))?.ok).toBe(true);
  });
});

describe("Checkout com endereço salvo + admin do pedido", () => {
  it("usa o endereço da conta, salva snapshot e o admin ajusta prazo/custo de frete", async () => {
    await db.insert(shippingZones).values({ name: "Zona UAT", cepStart: 13470000, cepEnd: 13470999, priceCents: 900, costCents: 500, minDays: 1, maxDays: 2 }).onConflictDoNothing();
    const u = await makeUser("customer", { name: "Cliente UAT" });
    asUser({ id: u.id, email: u.email!, role: "customer" });
    await saveAddressAction(null, fd({ label: "Casa", zip: "13470-100", street: "Rua dos Testes", number: "10", district: "Parque das Nações", city: "Americana", state: "SP", reference: "portão azul" }));
    const addr = (await db.query.addresses.findFirst({ where: eq(addresses.userId, u.id) }))!;
    const { product } = await makeProduct({ stockQty: 5, priceCents: 5000 });
    await expectRedirect(addToCartAction(fd({ productId: product.id, quantity: 1 })));
    const q = await quoteForCepAction("13470100");
    const local = q.options.find((o) => o.method === "delivery")!;
    expect(local).toBeTruthy();

    // CEP do endereço diferente do cotado → erro; endereço de outro usuário → erro
    const other = await makeUser("customer");
    ctx.session = { user: { id: other.id, email: other.email!, name: "Outro", role: "customer" } };
    await expectRedirect(addToCartAction(fd({ productId: product.id, quantity: 1 })));
    await quoteForCepAction("13470100");
    expect((await placeOrderAction(null, fd({ name: "Outro", email: other.email!, phone: "19999990000", shippingOptionId: local.id, zip: "13470100", addressId: addr.id, acceptTerms: "on" })))?.error).toMatch(/não encontrado/);

    asUser({ id: u.id, email: u.email!, role: "customer" });
    await expectRedirect(addToCartAction(fd({ productId: product.id, quantity: 1 })));
    await quoteForCepAction("13470100");
    await expectRedirect(placeOrderAction(null, fd({ name: "Cliente UAT", email: u.email!, phone: "19999990000", shippingOptionId: local.id, zip: "13470100", addressId: addr.id, acceptTerms: "on" })));
    const order = (await db.query.orders.findFirst({ where: eq(orders.userId, u.id), orderBy: desc(orders.createdAt) }))!;
    expect(order.shippingAddress?.street).toBe("Rua dos Testes");
    expect(order.shippingAddress?.reference).toBe("portão azul");
    expect(order.shippingCents).toBe(900);
    expect(order.shippingCostCents).toBe(500);
    expect(order.shippingService).toMatch(/Zona UAT/);
    // WhatsApp do checkout completa o perfil que não tinha telefone
    expect((await db.query.users.findFirst({ where: eq(users.id, u.id) }))?.phone).toBe("19999990000");
    // cookie de frete limpo após o pedido
    expect((await readShippingPref()).optionId).toBeNull();

    // admin ajusta prazo de produção e custo real do frete
    const admin = await makeUser("admin");
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    await updateOrderNotesAction(fd({ id: order.id, productionDays: "4", shippingCost: "7,50", adminNotes: "etiqueta comprada" }));
    const upd = (await db.query.orders.findFirst({ where: eq(orders.id, order.id), with: { events: true } }))!;
    expect(upd.productionDays).toBe(4);
    expect(upd.shippingCostCents).toBe(750);
    expect(upd.events.some((e) => /Prazo de produção ajustado para 4/.test(e.message))).toBe(true);
  });
});

describe("Máquinas", () => {
  it("excluir máquina desvincula jobs e mantém histórico", async () => {
    const admin = await makeUser("admin");
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    const pr = await makePrinter();
    await db.insert(printJobs).values({ title: "job na máquina", printerId: pr.id, quantity: 1, estimatedMinutes: 30 });
    await deletePrinterAction(fd({ id: pr.id }));
    expect(await db.query.printers.findFirst({ where: eq(printers.id, pr.id) })).toBeUndefined();
    const job = await db.query.printJobs.findFirst({ where: and(eq(printJobs.title, "job na máquina")) });
    expect(job).toBeTruthy();
    expect(job?.printerId).toBeNull();
    // produção não pode excluir máquina? (machines.manage é de produção também) — atendimento não pode
    const sup = await makeUser("support");
    asUser({ id: sup.id, email: sup.email!, role: "support" });
    await expect(deletePrinterAction(fd({ id: "x" }))).rejects.toThrow(/Não autorizado/);
  });
});

describe("LGPD: exportação inclui endereços e exige login", () => {
  it("GET /api/me/export", async () => {
    const { GET } = await import("@/app/api/me/export/route");
    asGuest();
    expect((await GET()).status).toBe(401);
    const u = await makeUser("customer");
    asUser({ id: u.id, email: u.email!, role: "customer" });
    await saveAddressAction(null, fd({ label: "Casa", zip: "13470-100", street: "Rua dos Testes", number: "10", city: "Americana", state: "SP" }));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { titular: { email: string }; enderecos: unknown[] };
    expect(body.titular.email).toBe(u.email);
    expect(body.enderecos).toHaveLength(1);
  });
});
