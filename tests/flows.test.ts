/**
 * UAT automatizado dos fluxos ponta a ponta contra o banco de teste.
 * Cada describe simula um "roteiro" de usuário (cliente ou equipe).
 */
import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { attachments, auditLogs, consents, customers, materials, orders, printJobs, printers, products, productVariants, quotes, rateLimits, stockMovements, tickets, users } from "@/db/schema";
import { asGuest, asUser, ctx, expectRedirect, resetCtx } from "./ctx";
import { fd, makeMaterial, makePrinter, makeProduct, makeUser, makeVariant, pngFile } from "./factory";

import { signupAction, changePasswordAction, loginAction } from "@/actions/auth";
import { addToCartAction, removeFromCartAction, updateCartQtyAction } from "@/actions/cart";
import { placeOrderAction } from "@/actions/checkout";
import { saveProductAction, deleteProductAction } from "@/actions/catalog";
import { addQuoteToCartAction, adminUpdateQuoteAction, customerQuoteMessageAction, rejectQuoteAction, requestQuoteAction } from "@/actions/quotes";
import { createStockBatchAction, setPrintJobStatusAction, addStockMovementAction } from "@/actions/erp";
import { createPrintJobsFromOrderAction, updatePaymentStatusAction } from "@/actions/orders";
import { adminTicketReplyAction, customerTicketReplyAction, openTicketAction } from "@/actions/tickets";
import { cookieConsentAction, deleteAccountAction } from "@/actions/consent";
import { updateUserRoleAction } from "@/actions/users";
import { getCart } from "@/lib/cart";
import { quoteForCepAction } from "@/actions/shipping";
import { shippingZones } from "@/db/schema";
import { saveUploads } from "@/lib/uploads";

beforeEach(() => resetCtx());

const lastAudit = (action: string) => db.query.auditLogs.findFirst({ where: eq(auditLogs.action, action), orderBy: desc(auditLogs.createdAt) });

describe("Cadastro e conta", () => {
  it("cria conta com senha forte + aceite, registra consentimentos (IP/e-mail/versão) e auditoria", async () => {
    const email = `novo-${Date.now()}@teste.local`;
    ctx.ip = "198.51.100.7";
    await expect(signupAction(null, fd({ name: "Nova Cliente", email, password: "Senha-Forte#2026", acceptTerms: "on" }))).resolves.toEqual({ ok: true });
    const u = await db.query.users.findFirst({ where: eq(users.email, email) });
    expect(u?.role).toBe("customer");
    expect(u?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const cs = await db.query.consents.findMany({ where: eq(consents.email, email) });
    expect(cs.map((c) => c.type).sort()).toEqual(["privacy", "terms"]);
    expect(cs[0].ip).toBe("198.51.100.7");
    expect(cs[0].version).toBeTruthy();
    const c = await db.query.customers.findFirst({ where: eq(customers.email, email) });
    expect(c?.userId).toBe(u!.id);
    expect((await lastAudit("auth.signup"))?.actorEmail).toBe(email);
  });

  it("rejeita senha fraca, sem aceite dos termos e e-mail duplicado", async () => {
    const email = `dup-${Date.now()}@teste.local`;
    expect((await signupAction(null, fd({ name: "Xavier", email, password: "fraca123", acceptTerms: "on" })))?.error).toMatch(/10 caracteres|maiúscula/);
    expect((await signupAction(null, fd({ name: "Xavier", email, password: "Senha-Forte#2026" })))?.error).toMatch(/Termos/);
    await signupAction(null, fd({ name: "Xavier", email, password: "Senha-Forte#2026", acceptTerms: "on" }));
    expect((await signupAction(null, fd({ name: "Xavier", email, password: "Senha-Forte#2026", acceptTerms: "on" })))?.error).toMatch(/Já existe/);
  });

  it("cadastro público nunca cria admin mesmo enviando role", async () => {
    const email = `hack-${Date.now()}@teste.local`;
    await signupAction(null, fd({ name: "Hacker", email, password: "Senha-Forte#2026", acceptTerms: "on", role: "admin" }));
    expect((await db.query.users.findFirst({ where: eq(users.email, email) }))?.role).toBe("customer");
  });

  it("troca de senha exige senha atual correta e nova forte", async () => {
    const email = `pw-${Date.now()}@teste.local`;
    await signupAction(null, fd({ name: "Paula", email, password: "Senha-Forte#2026", acceptTerms: "on" }));
    const u = (await db.query.users.findFirst({ where: eq(users.email, email) }))!;
    asUser({ id: u.id, email });
    expect((await changePasswordAction(null, fd({ current: "errada", password: "Outra-Senha#2027", confirm: "Outra-Senha#2027" })))?.error).toMatch(/incorreta/);
    expect((await changePasswordAction(null, fd({ current: "Senha-Forte#2026", password: "curta", confirm: "curta" })))?.error).toBeTruthy();
    expect((await changePasswordAction(null, fd({ current: "Senha-Forte#2026", password: "Outra-Senha#2027", confirm: "Outra-Senha#2027" })))?.ok).toBe(true);
    expect(await lastAudit("auth.password_changed")).toBeTruthy();
  });

  it("rate limit bloqueia força bruta no login (11ª tentativa por e-mail)", async () => {
    const email = `brute-${Date.now()}@teste.local`;
    await db.delete(rateLimits);
    for (let i = 0; i < 10; i++) await loginAction(null, fd({ email, password: "qualquer" }));
    const r = await loginAction(null, fd({ email, password: "qualquer" }));
    expect(r?.error).toMatch(/Muitas tentativas/);
  });
});

describe("Backoffice: catálogo com RBAC", () => {
  it("atendimento não cria produto; admin cria com BOM, mídia (vídeo detectado) e tipo custom", async () => {
    const support = await makeUser("support");
    asUser({ id: support.id, email: support.email!, role: "support" });
    await expect(saveProductAction(null, fd({ name: "Bloqueado", status: "active", price: "10,00" }))).rejects.toThrow(/Não autorizado/);

    const admin = await makeUser("admin");
    const m = await makeMaterial({ costPerKgCents: 12000 });
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    const url = await expectRedirect(
      saveProductAction(
        null,
        fd({
          name: "Topper de Bolo Personalizado",
          status: "active",
          kind: "custom",
          quoteBrief: "Nome:\nIdade:\nTema:",
          price: "39,90",
          cost: "9,00",
          tags: "Novidades, destaques",
          printMinutes: "45",
          bom: JSON.stringify([{ materialId: m.id, gramsPerUnit: 12, note: "corpo" }]),
          images: "https://cdn.x/a.jpg\nhttps://cdn.x/v.mp4 | https://cdn.x/capa.jpg",
        }),
      ),
    );
    expect(url).toMatch(/^\/admin\/produtos\//);
    const p = await db.query.products.findFirst({ where: eq(products.slug, "topper-de-bolo-personalizado"), with: { bom: true, images: true } });
    expect(p?.kind).toBe("custom");
    expect(p?.tags).toEqual(["novidades", "destaques"]);
    expect(p?.materialGrams).toBe(12);
    expect(p?.materialId).toBe(m.id);
    expect(p?.images.map((i) => i.type)).toEqual(["image", "video"]);
    expect(p?.images[1].posterUrl).toBe("https://cdn.x/capa.jpg");
    expect((await lastAudit("product.created"))?.entityId).toBe(p!.id);

    // slug duplicado é recusado
    expect((await saveProductAction(null, fd({ name: "Topper de Bolo Personalizado", status: "active", price: "1,00" })))?.error).toMatch(/slug/);
    // produção não exclui produto
    const prod = await makeUser("production");
    asUser({ id: prod.id, email: prod.email!, role: "production" });
    await expect(deleteProductAction(fd({ id: p!.id }))).rejects.toThrow(/Não autorizado/);
  });
});

describe("Cliente: carrinho e checkout (PIX manual)", () => {
  it("compra como visitante: reserva estoque, cria pedido/cliente, registra aceite e redireciona com token", async () => {
    const { product, material } = await makeProduct({ priceCents: 2000, stockQty: 5 });
    const v = await makeVariant(product.id, "Rosa", 3, material.id);
    asGuest();
    await expectRedirect(addToCartAction(fd({ productId: product.id, variantId: v.id, quantity: 2, customization: "Nome: Ana" })));
    let cart = await getCart();
    expect(cart.count).toBe(2);
    expect(cart.subtotalCents).toBe(4000);
    expect(cart.items[0].variantLabel).toBe("Cor: Rosa");

    // quantidade acima do estoque da variação é limitada
    await updateCartQtyAction(fd({ key: `${product.id}|${v.id}|Nome: Ana`, quantity: 50 }));
    cart = await getCart();
    expect(cart.items[0].quantity).toBe(3);

    expect((await placeOrderAction(null, fd({ name: "Ana", email: "ana@teste.local", phone: "11999990000", shippingOptionId: "pickup" })))?.error).toMatch(/Termos/);
    // frete: zona local de teste cobrindo o CEP; cotação grava o CEP no cookie e devolve a opção da zona
    await db.insert(shippingZones).values({ name: "Zona Teste", cepStart: 1000000, cepEnd: 1999999, priceCents: 1500, costCents: 900, minDays: 1, maxDays: 2 }).onConflictDoNothing();
    const quote = await quoteForCepAction("01000-000");
    const local = quote.options.find((o) => o.method === "delivery")!;
    expect(local.priceCents).toBe(1500);
    expect("costCents" in local).toBe(false); // custo interno não vaza para o cliente
    // opção inexistente / preço não vem do formulário
    expect((await placeOrderAction(null, fd({ name: "Ana Visitante", email: "ana@teste.local", phone: "11999990000", shippingOptionId: "zone:fake", zip: "01000-000", street: "Rua A", number: "10", city: "SP", state: "sp", acceptTerms: "on" })))?.error).toMatch(/Recalcule/);
    const url = await expectRedirect(placeOrderAction(null, fd({ name: "Ana Visitante", email: "ANA@teste.local", phone: "11999990000", shippingOptionId: local.id, zip: "01000-000", street: "Rua A", number: "10", city: "SP", state: "sp", reference: "portão azul", acceptTerms: "on" })));
    expect(url).toMatch(/^\/pedido\/[0-9a-f-]+\?t=[0-9a-f]{32}$/);

    const order = (await db.query.orders.findFirst({ orderBy: desc(orders.createdAt), with: { items: true, events: true } }))!;
    expect(order.customerEmail).toBe("ana@teste.local");
    expect(order.paymentMethod).toBe("pix_manual");
    expect(order.shippingCents).toBe(1500);
    expect(order.totalCents).toBe(6000 + 1500);
    expect(order.shippingMethod).toBe("delivery");
    expect(order.shippingService).toMatch(/Zona Teste/);
    expect(order.shippingZip).toBe("01000000");
    expect(order.shippingCostCents).toBe(900);
    expect(order.productionDays).toBe(1); // itens em estoque → só embalagem/postagem
    expect(order.shippingDaysMax).toBe(3); // zona 2 d.u. + 1 de embalagem
    expect(order.shippingAddress?.state).toBe("SP");
    expect(order.shippingAddress?.zip).toBe("01000000");
    expect(order.shippingAddress?.reference).toBe("portão azul");
    expect(order.items[0].customization).toBe("Nome: Ana");
    expect((await db.query.productVariants.findFirst({ where: eq(productVariants.id, v.id) }))?.stockQty).toBe(0);
    expect((await db.query.products.findFirst({ where: eq(products.id, product.id) }))?.stockQty).toBe(2);
    expect((await db.query.customers.findFirst({ where: eq(customers.email, "ana@teste.local") }))?.stage).toBe("active");
    expect(await db.query.consents.findFirst({ where: and(eq(consents.email, "ana@teste.local"), eq(consents.type, "terms")) })).toBeTruthy();
    expect((await getCart()).count).toBe(0);
    expect((await lastAudit("order.created"))?.channel).toBe("customer");

    // remover linha inexistente não quebra; carrinho com produto inativo é limpo
    await removeFromCartAction(fd({ key: "nada" }));
    await expectRedirect(addToCartAction(fd({ productId: product.id, quantity: 1 })));
    await db.update(products).set({ status: "archived" }).where(eq(products.id, product.id));
    expect((await getCart()).count).toBe(0);
  });
});

describe("Personalizados: orçamento → item exclusivo → checkout", () => {
  it("fluxo completo com acesso por token, precificação, carrinho só do dono e aprovação no checkout", async () => {
    const admin = await makeUser("admin");
    const owner = await makeUser("customer", { email: `dona-${Date.now()}@teste.local`, name: "Dona" });
    const intruder = await makeUser("customer");
    const { product, material } = await makeProduct({ kind: "custom", gramsPerUnit: 20, printMinutes: 60, costCents: 800 });

    // visitante pede orçamento a partir do item do catálogo, com anexo
    asGuest();
    const qurl = await expectRedirect(
      requestQuoteAction(null, fd({ name: "Dona", email: owner.email!, phone: "11988887777", title: "Topper Ana 5 anos", description: "Tema unicórnio, rosa e lilás, 12cm", quantity: 2, productId: product.id, structured: "Tipo: Presente · Acabamento: Padrão", acceptTerms: "on", files: pngFile("ref.png") })),
    );
    const [, quoteId, token] = qurl.match(/^\/orcamento\/([0-9a-f-]+)\?t=([0-9a-f]{32})$/)!;
    const q1 = (await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId), with: { messages: true } }))!;
    expect(q1.productId).toBe(product.id);
    expect(q1.estimatedGrams).toBe(20);
    expect(q1.estimatedMinutes).toBe(60);
    expect(q1.costCents).toBe(1600); // 800 × 2
    expect(q1.description).toContain("Acabamento: Padrão");
    expect(q1.messages).toHaveLength(1);
    expect(await db.query.attachments.findFirst({ where: eq(attachments.refId, q1.messages[0].id) })).toBeTruthy();

    // mensagem do cliente sem token/sessão é ignorada; com token funciona
    await customerQuoteMessageAction(fd({ quoteId, body: "invasor" }));
    expect((await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId), with: { messages: true } }))!.messages).toHaveLength(1);
    await customerQuoteMessageAction(fd({ quoteId, t: token, body: "Pode ser 15cm?" }));
    expect((await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId), with: { messages: true } }))!.messages).toHaveLength(2);

    // admin não consegue marcar como orçado sem preço; depois precifica
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    expect((await adminUpdateQuoteAction(null, fd({ id: quoteId, status: "quoted", priceCents: "" })))?.error).toMatch(/preço/);
    expect((await adminUpdateQuoteAction(null, fd({ id: quoteId, status: "quoted", priceCents: "120,00", costCents: "16,00", materialId: material.id, estimatedGrams: 20, estimatedMinutes: 60 })))?.ok).toBe(true);
    expect((await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId), with: { messages: true } }))!.messages.at(-1)?.body).toMatch(/Orçamento enviado/);

    // intruso logado não vê nem adiciona; dono adiciona
    asUser({ id: intruder.id, email: intruder.email! });
    await addQuoteToCartAction(fd({ quoteId }));
    expect((await getCart()).items).toHaveLength(0);
    asUser({ id: owner.id, email: owner.email! });
    await expectRedirect(addQuoteToCartAction(fd({ quoteId })));
    const cart = await getCart();
    expect(cart.items[0]).toMatchObject({ isCustom: true, unitPriceCents: 12000, quantity: 1 });

    // checkout com e-mail diferente do dono é recusado; com o e-mail certo aprova o orçamento
    expect((await placeOrderAction(null, fd({ name: "Dona", email: "outra@teste.local", phone: "11988887777", shippingOptionId: "pickup", acceptTerms: "on" })))?.error).toMatch(/e-mail da sua conta/);
    await expectRedirect(placeOrderAction(null, fd({ name: "Dona", email: owner.email!, phone: "11988887777", shippingOptionId: "pickup", acceptTerms: "on" })));
    const q2 = (await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) }))!;
    expect(q2.status).toBe("approved");
    expect(q2.orderId).toBeTruthy();
    const order = (await db.query.orders.findFirst({ where: eq(orders.id, q2.orderId!), with: { items: true } }))!;
    expect(order.items[0].quoteId).toBe(quoteId);
    expect(order.totalCents).toBe(12000);

    // recusar depois de aprovado não muda nada
    asGuest();
    await rejectQuoteAction(fd({ quoteId, t: token }));
    expect((await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) }))!.status).toBe("approved");
  });
});

describe("Studio: pedido pago → fila → fornada com perdas → estoque", () => {
  it("pagamento manual, jobs do pedido, fornada de reposição com baixa por BOM e desperdício", async () => {
    const admin = await makeUser("admin");
    const mat = await makeMaterial({ stockGrams: 1000, costPerKgCents: 10000 });
    const { product } = await makeProduct({ materialId: mat.id, gramsPerUnit: 30, printMinutes: 60, stockQty: 0, priceCents: 3000 });
    const printer = await makePrinter();

    // pedido de visitante com 2 unidades
    asGuest();
    await expectRedirect(addToCartAction(fd({ productId: product.id, quantity: 2 })));
    await expectRedirect(placeOrderAction(null, fd({ name: "Beto", email: "beto@teste.local", phone: "11977776666", shippingOptionId: "pickup", acceptTerms: "on" })));
    const order = (await db.query.orders.findFirst({ orderBy: desc(orders.createdAt) }))!;
    expect((await db.query.products.findFirst({ where: eq(products.id, product.id) }))?.stockQty).toBe(-2); // sob demanda

    // atendimento confirma PIX manual → pago; produção não pode
    const prod = await makeUser("production");
    asUser({ id: prod.id, email: prod.email!, role: "production" });
    await expect(updatePaymentStatusAction(fd({ id: order.id, paymentStatus: "approved" }))).rejects.toThrow();
    const sup = await makeUser("support");
    asUser({ id: sup.id, email: sup.email!, role: "support" });
    await updatePaymentStatusAction(fd({ id: order.id, paymentStatus: "approved" }));
    // pagamento aprovado já coloca o item sem estoque na fila e o pedido em produção
    expect((await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))?.status).toBe("in_production");
    expect((await lastAudit("order.payment_changed"))?.level).toBe("warn");

    // botão manual é idempotente (não duplica); jobs herdam BOM
    await createPrintJobsFromOrderAction(fd({ id: order.id }));
    const jobs = await db.query.printJobs.findMany({ where: eq(printJobs.orderId, order.id) });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ quantity: 2, estimatedGrams: 60, estimatedMinutes: 120, addsToStock: false });
    expect((await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))?.status).toBe("in_production");

    // produção conclui o job do pedido: 2 boas → pedido pronto, material -60g
    asUser({ id: prod.id, email: prod.email!, role: "production" });
    await setPrintJobStatusAction(fd({ id: jobs[0].id, status: "printing" }));
    await setPrintJobStatusAction(fd({ id: jobs[0].id, status: "done", producedQty: 2, failedQty: 0, wasteGrams: 0, actualMinutes: 130 }));
    expect((await db.query.orders.findFirst({ where: eq(orders.id, order.id) }))?.status).toBe("ready");
    expect((await db.query.materials.findFirst({ where: eq(materials.id, mat.id) }))?.stockGrams).toBe(940);
    expect((await db.query.products.findFirst({ where: eq(products.id, product.id) }))?.stockQty).toBe(-2); // job de pedido não repõe estoque

    // fornada de reposição de 10: 8 boas, 2 perdidas, 15g de purga
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    await createStockBatchAction(fd({ productId: product.id, quantity: 10, printerId: printer.id }));
    const batch = (await db.query.printJobs.findFirst({ where: and(eq(printJobs.productId, product.id), eq(printJobs.addsToStock, true)) }))!;
    expect(batch.estimatedGrams).toBe(300);
    await setPrintJobStatusAction(fd({ id: batch.id, status: "printing" }));
    expect((await db.query.printers.findFirst({ where: eq(printers.id, printer.id) }))?.status).toBe("printing");
    await setPrintJobStatusAction(fd({ id: batch.id, status: "failed", producedQty: 8, failedQty: 2, wasteGrams: 15, actualMinutes: 600 }));
    const done = (await db.query.printJobs.findFirst({ where: eq(printJobs.id, batch.id) }))!;
    expect(done.status).toBe("done"); // saiu peça boa → done
    expect(done.actualGrams).toBe(240);
    expect((await db.query.products.findFirst({ where: eq(products.id, product.id) }))?.stockQty).toBe(6); // -2 + 8
    expect((await db.query.materials.findFirst({ where: eq(materials.id, mat.id) }))?.stockGrams).toBe(940 - 240 - 60 - 15);
    const moves = await db.query.stockMovements.findMany({ where: eq(stockMovements.refId, batch.id) });
    expect(moves.map((m) => [m.reason, m.deltaGrams]).sort()).toEqual([["print", -240], ["waste", -60], ["waste", -15]].sort());
    const pr = (await db.query.printers.findFirst({ where: eq(printers.id, printer.id) }))!;
    expect(pr.status).toBe("idle");
    expect(pr.totalPrintMinutes).toBe(600);

    // concluir de novo não baixa duas vezes
    await setPrintJobStatusAction(fd({ id: batch.id, status: "done", producedQty: 8 }));
    expect((await db.query.materials.findFirst({ where: eq(materials.id, mat.id) }))?.stockGrams).toBe(940 - 240 - 60 - 15);

    // compra de material atualiza custo/kg e lança despesa
    expect((await addStockMovementAction(null, fd({ materialId: mat.id, reason: "purchase", deltaGrams: 1000, unitCost: "110,00" })))?.ok).toBe(true);
    const m2 = (await db.query.materials.findFirst({ where: eq(materials.id, mat.id) }))!;
    expect(m2.costPerKgCents).toBe(11000);
    expect(m2.stockGrams).toBe(940 - 240 - 60 - 15 + 1000);
  });
});

describe("Atendimento: chamados com anexos", () => {
  it("visitante abre chamado (token), admin responde (→ aguardando), cliente responde pelo token (→ aberto)", async () => {
    asGuest();
    const url = await expectRedirect(openTicketAction(null, fd({ name: "Carla", email: "carla@teste.local", subject: "Peça quebrada", category: "product", body: "Chegou com a asa quebrada, segue foto", acceptTerms: "on", files: pngFile("quebrada.png") })));
    const [, ticketId, token] = url.match(/^\/ajuda\/chamados\/([0-9a-f-]+)\?t=([0-9a-f]{32})/)!;
    const t1 = (await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId), with: { messages: true } }))!;
    expect(t1.status).toBe("open");
    expect(t1.messages).toHaveLength(1);

    // atendimento responde e o status vira "aguardando cliente"; nota interna não muda status
    const sup = await makeUser("support");
    asUser({ id: sup.id, email: sup.email!, role: "support" });
    await adminTicketReplyAction(fd({ ticketId, body: "Sentimos muito! Vamos reimprimir.", files: pngFile("render.png") }));
    expect((await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) }))?.status).toBe("pending");
    await adminTicketReplyAction(fd({ ticketId, body: "cliente VIP", isInternal: "on" }));
    expect((await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) }))?.status).toBe("pending");

    // cliente sem token não consegue; com token reabre
    asGuest();
    await customerTicketReplyAction(fd({ ticketId, body: "invasor" }));
    await customerTicketReplyAction(fd({ ticketId, t: token, body: "Obrigada!" }));
    const t2 = (await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId), with: { messages: true } }))!;
    expect(t2.status).toBe("open");
    expect(t2.messages.filter((m) => !m.isInternal)).toHaveLength(3);
    expect(t2.messages.some((m) => m.body === "invasor")).toBe(false);
    // produção não gerencia chamados
    const prod = await makeUser("production");
    asUser({ id: prod.id, email: prod.email!, role: "production" });
    await expect(adminTicketReplyAction(fd({ ticketId, body: "x" }))).rejects.toThrow();
  });

  it("uploads: rejeita SVG/HTML e arquivos grandes, aceita PNG e STL", async () => {
    const svg = new File(["<svg onload=alert(1)/>"], "x.svg", { type: "image/svg+xml" });
    const html = new File(["<script>"], "x.html", { type: "text/html" });
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    const stl = new File([new Uint8Array(100)], "peca.stl", { type: "application/octet-stream" });
    const f = new FormData();
    for (const x of [svg, html, big, stl, pngFile()]) f.append("files", x);
    const r = await saveUploads(f, "ticket_message", "msg-teste");
    expect(r.saved).toBe(1); // dos 4 primeiros (limite por envio) só o STL passa; svg/html/big rejeitados
    expect(r.rejected.join(" ")).toMatch(/x\.svg/);
    expect(r.rejected.join(" ")).toMatch(/x\.html/);
    expect(r.rejected.join(" ")).toMatch(/big\.png/);
  });
});

describe("LGPD e governança", () => {
  it("banner de cookies grava cookie e consentimento com IP", async () => {
    ctx.ip = "192.0.2.9";
    await cookieConsentAction(fd({ choice: "all" }));
    expect(ctx.cookies.get("ahl_consent")).toBe("all");
    const c = await db.query.consents.findFirst({ where: eq(consents.type, "cookies"), orderBy: desc(consents.createdAt) });
    expect(c?.ip).toBe("192.0.2.9");
    expect(c?.meta).toMatchObject({ choice: "all" });
  });

  it("exclusão de conta pelo titular anonimiza pedidos e apaga o usuário; admin não pode se autoexcluir", async () => {
    const u = await makeUser("customer", { email: `sair-${Date.now()}@teste.local` });
    const { product } = await makeProduct();
    asUser({ id: u.id, email: u.email! });
    await expectRedirect(addToCartAction(fd({ productId: product.id, quantity: 1 })));
    await expectRedirect(placeOrderAction(null, fd({ name: "Vai Sair", email: u.email!, phone: "11955554444", shippingOptionId: "pickup", acceptTerms: "on" })));
    expect((await deleteAccountAction(null, fd({ confirm: "nao" })))?.error).toMatch(/EXCLUIR/);
    await deleteAccountAction(null, fd({ confirm: "excluir" }));
    expect(await db.query.users.findFirst({ where: eq(users.id, u.id) })).toBeUndefined();
    const o = (await db.query.orders.findFirst({ orderBy: desc(orders.createdAt) }))!;
    expect(o.customerName).toBe("Cliente removido");
    expect(o.customerEmail).toMatch(/@removido\.local$/);
    expect(o.userId).toBeNull();
    expect((await lastAudit("account.deleted"))?.level).toBe("warn");

    const admin = await makeUser("admin");
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    expect((await deleteAccountAction(null, fd({ confirm: "EXCLUIR" })))?.error).toMatch(/administrador/i);
  });

  it("gestão de papéis: só admin, sem autorrebaixamento e sem remover o último admin", async () => {
    const admin = await makeUser("admin");
    const target = await makeUser("customer");
    const sup = await makeUser("support");
    asUser({ id: sup.id, email: sup.email!, role: "support" });
    await expect(updateUserRoleAction(null, fd({ id: target.id, role: "admin", active: "on" }))).rejects.toThrow();
    asUser({ id: admin.id, email: admin.email!, role: "admin" });
    expect((await updateUserRoleAction(null, fd({ id: admin.id, role: "customer", active: "on" })))?.error).toMatch(/própria conta/);
    expect((await updateUserRoleAction(null, fd({ id: target.id, role: "production", active: "on" })))?.ok).toBe(true);
    expect((await db.query.users.findFirst({ where: eq(users.id, target.id) }))?.role).toBe("production");
    expect((await lastAudit("user.role_changed"))?.level).toBe("warn");
    // bloqueio
    expect((await updateUserRoleAction(null, fd({ id: target.id, role: "production" })))?.ok).toBe(true);
    expect((await db.query.users.findFirst({ where: eq(users.id, target.id) }))?.active).toBe(false);
  });

  it("auditoria não guarda query string do referer (tokens)", async () => {
    const logs = await db.query.auditLogs.findMany({ limit: 200 });
    expect(logs.some((l) => l.path?.includes("?"))).toBe(false);
    expect(logs.some((l) => l.path?.includes("segredo"))).toBe(false);
  });
});
