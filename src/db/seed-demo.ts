/**
 * Seed de DEMONSTRAÇÃO do backoffice: clientes, pedidos em todos os status (6 meses de histórico),
 * orçamentos, fornadas com perdas, insumos, despesas OPEX/COGS recorrentes, CAPEX, receitas manuais,
 * chamados e consentimentos — para validar dashboard, financeiro, forecast e relatórios.
 *
 *   npm run db:seed:demo            → cria (idempotente: não duplica)
 *   npm run db:seed:demo -- --clean → remove tudo que foi criado por este seed
 *
 * Tudo que este script cria é marcado com e-mails @demo.ahlstudio ou o prefixo "[DEMO]".
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, inArray, like, or } from "drizzle-orm";
import * as schema from "./schema";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const db = drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined }), { schema });
const DEMO = "[DEMO] ";
const daysAgo = (n: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const num = (prefix: string, i: number) => `${prefix}-DEMO-${String(i).padStart(3, "0")}`;
let rnd = 42;
const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];

async function clean() {
  const demoCustomers = await db.query.customers.findMany({ where: like(schema.customers.email, "%@demo.ahlstudio") });
  const ids = demoCustomers.map((c) => c.id);
  if (ids.length) {
    const os = await db.query.orders.findMany({ where: inArray(schema.orders.customerId, ids), columns: { id: true } });
    if (os.length) await db.delete(schema.printJobs).where(inArray(schema.printJobs.orderId, os.map((o) => o.id)));
    await db.delete(schema.orders).where(inArray(schema.orders.customerId, ids));
    await db.delete(schema.quotes).where(inArray(schema.quotes.customerId, ids));
    await db.delete(schema.tickets).where(inArray(schema.tickets.customerId, ids));
    await db.delete(schema.customers).where(inArray(schema.customers.id, ids));
  }
  await db.delete(schema.users).where(like(schema.users.email, "%@demo.ahlstudio"));
  await db.delete(schema.consents).where(like(schema.consents.email, "%@demo.ahlstudio"));
  await db.delete(schema.printJobs).where(like(schema.printJobs.title, `${DEMO}%`));
  await db.delete(schema.expenses).where(like(schema.expenses.description, `${DEMO}%`));
  await db.delete(schema.assets).where(like(schema.assets.name, `${DEMO}%`));
  await db.delete(schema.manualRevenues).where(like(schema.manualRevenues.description, `${DEMO}%`));
  await db.delete(schema.stockMovements).where(like(schema.stockMovements.note, `${DEMO}%`));
  await db.delete(schema.supplyMovements).where(like(schema.supplyMovements.note, `${DEMO}%`));
  const sup = await db.query.supplies.findMany({ where: like(schema.supplies.sku, "DEMO-%") });
  if (sup.length) {
    await db.delete(schema.productSupplies).where(inArray(schema.productSupplies.supplyId, sup.map((s) => s.id)));
    await db.delete(schema.supplies).where(inArray(schema.supplies.id, sup.map((s) => s.id)));
  }
  await db.delete(schema.auditLogs).where(or(like(schema.auditLogs.actorEmail, "%@demo.ahlstudio"), like(schema.auditLogs.summary, `${DEMO}%`)));
  console.log("✔ dados de demonstração removidos");
}

async function main() {
  if (process.argv.includes("--clean")) return clean();
  if (await db.query.customers.findFirst({ where: like(schema.customers.email, "%@demo.ahlstudio") })) {
    console.log("• demo já existe. Use --clean para remover e rode de novo.");
    return;
  }

  const products = await db.query.products.findMany({ with: { variants: true, bom: true } });
  const materials = await db.query.materials.findMany();
  const printers = await db.query.printers.findMany();
  if (!products.length || !materials.length) throw new Error("Rode npm run db:seed antes (produtos/materiais base).");
  const stockProducts = products.filter((p) => p.kind === "stock");
  const mat = (name: string) => materials.find((m) => m.name === name) ?? materials[0];

  // ---------- insumos (almoxarifado) ----------
  const suppliesSeed = [
    { sku: "DEMO-CX1", name: "Caixa de papelão 16x11x6", category: "packaging", unit: "un", unitCostCents: 180, qty: 120, minQty: 30, location: "Prateleira A1", supplier: "Embalagens SP" },
    { sku: "DEMO-SAC", name: "Saco kraft com adesivo", category: "packaging", unit: "un", unitCostCents: 45, qty: 400, minQty: 100, location: "Prateleira A1", supplier: "Embalagens SP" },
    { sku: "DEMO-LED", name: "Kit LED quente 3V + bateria", category: "electronics", unit: "kit", unitCostCents: 950, qty: 18, minQty: 10, location: "Gaveta E2", supplier: "Eletro Import" },
    { sku: "DEMO-IMA", name: "Ímã neodímio 8x2 mm", category: "hardware", unit: "un", unitCostCents: 60, qty: 40, minQty: 50, location: "Gaveta H1", supplier: "Magnetos BR" },
    { sku: "DEMO-ARG", name: "Argola de chaveiro 25 mm", category: "hardware", unit: "un", unitCostCents: 25, qty: 300, minQty: 100, location: "Gaveta H2", supplier: "Aviamentos Centro" },
    { sku: "DEMO-LIX", name: "Lixa d'água 400", category: "finishing", unit: "folha", unitCostCents: 220, qty: 25, minQty: 10, location: "Gaveta F1", supplier: "Ferragens do Bairro" },
    { sku: "DEMO-BIC", name: "Bico 0.4 mm latão", category: "tooling", unit: "un", unitCostCents: 1200, qty: 6, minQty: 4, location: "Gaveta T1", supplier: "3D Peças" },
  ] as const;
  const supplyIds: Record<string, string> = {};
  for (const s of suppliesSeed) {
    const [row] = await db.insert(schema.supplies).values({ ...s }).returning();
    supplyIds[s.sku] = row.id;
    await db.insert(schema.supplyMovements).values({ supplyId: row.id, delta: s.qty, reason: "purchase", unitCostCents: s.unitCostCents, note: `${DEMO}estoque inicial`, createdAt: daysAgo(150) });
  }
  // insumos na ficha técnica de alguns produtos
  const byName = (part: string) => products.find((p) => p.name.toLowerCase().includes(part));
  const lum = byName("lumin");
  const chav = byName("chaveiro");
  if (lum) await db.insert(schema.productSupplies).values([{ productId: lum.id, supplyId: supplyIds["DEMO-LED"], qtyPerUnit: 1, sortOrder: 0 }, { productId: lum.id, supplyId: supplyIds["DEMO-CX1"], qtyPerUnit: 1, sortOrder: 1 }]);
  if (chav) await db.insert(schema.productSupplies).values([{ productId: chav.id, supplyId: supplyIds["DEMO-ARG"], qtyPerUnit: 1, sortOrder: 0 }, { productId: chav.id, supplyId: supplyIds["DEMO-SAC"], qtyPerUnit: 1, sortOrder: 1 }]);
  console.log(`✔ ${suppliesSeed.length} insumos`);

  // ---------- clientes ----------
  const names = ["Ana Souza", "Bruno Lima", "Carla Mendes", "Diego Alves", "Elisa Rocha", "Felipe Costa", "Gabriela Nunes", "Henrique Dias", "Isabela Pires", "João Pedro Ramos", "Karina Lopes", "Lucas Ferreira", "Mariana Teixeira", "Nicolas Barros", "Olívia Castro", "Paulo Henrique", "Renata Freitas", "Sofia Martins", "Thiago Araújo", "Vitória Campos"];
  const sources = ["instagram", "site", "whatsapp", "indicação", "feira"];
  const custs: (typeof schema.customers.$inferSelect)[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const email = `${name.split(" ")[0].toLowerCase()}${i}@demo.ahlstudio`;
    const stage = i < 3 ? "vip" : i < 14 ? "active" : i < 18 ? "lead" : "inactive";
    const [c] = await db.insert(schema.customers).values({ name, email, phone: `1199${String(100000 + i * 731).slice(0, 6)}`, stage, source: pick(sources), tags: i < 3 ? ["vip", "recompra"] : i % 4 === 0 ? ["presente"] : [], instagram: i % 3 === 0 ? `@${name.split(" ")[0].toLowerCase()}.3d` : null, createdAt: daysAgo(180 - i * 8), notes: i === 0 ? "Compra sempre para presentear; gosta de rosa." : null }).returning();
    custs.push(c);
    await db.insert(schema.consents).values([
      { email, type: "terms", version: "1.0-2026-09-12", ip: `187.10.${i}.${20 + i}`, userAgent: "demo", createdAt: c.createdAt },
      { email, type: "privacy", version: "1.0-2026-09-12", ip: `187.10.${i}.${20 + i}`, userAgent: "demo", createdAt: c.createdAt },
    ]);
    if (i % 2 === 0) await db.insert(schema.interactions).values({ customerId: c.id, type: pick(["whatsapp", "instagram", "email"]), content: pick(["Perguntou prazo para presente de aniversário.", "Quer cor lilás; avisar quando chegar filamento.", "Enviou foto de referência pelo Instagram.", "Pediu desconto para 10 unidades."]), createdAt: daysAgo(30 - i), followUpAt: i < 4 ? daysAgo(-1 - i) : null });
  }
  console.log(`✔ ${custs.length} clientes`);

  // ---------- pedidos: 6 meses ----------
  const statuses: schema.OrderStatus[] = ["delivered", "delivered", "delivered", "shipped", "ready", "in_production", "paid", "pending_payment", "cancelled"];
  let orderIdx = 0;
  const created: { order: typeof schema.orders.$inferSelect; items: { productId: string; qty: number; costCents: number; name: string }[] }[] = [];
  for (let d = 175; d >= 0; d -= Math.max(1, Math.round(2 + rand() * 4))) {
    orderIdx++;
    const c = pick(custs.slice(0, 16));
    const nItems = 1 + Math.floor(rand() * 2);
    const items: { productId: string; variantId: string | null; qty: number; unit: number; cost: number; name: string; label: string | null }[] = [];
    for (let k = 0; k < nItems; k++) {
      const p = pick(stockProducts);
      const v = p.variants.length ? pick(p.variants) : null;
      const qty = 1 + Math.floor(rand() * 3);
      items.push({ productId: p.id, variantId: v?.id ?? null, qty, unit: p.priceCents + (v?.priceDeltaCents ?? 0), cost: p.costCents, name: p.name, label: v ? `${v.name}: ${v.value}` : null });
    }
    const subtotal = items.reduce((a, i) => a + i.unit * i.qty, 0);
    const shippingMethod = pick(["pickup", "pickup", "delivery", "correios"] as const);
    const shipping = shippingMethod === "pickup" ? 0 : shippingMethod === "delivery" ? 1500 : 2500;
    // status por idade: antigos entregues, recentes em andamento
    const status: schema.OrderStatus = d > 20 ? (rand() < 0.08 ? "cancelled" : "delivered") : d > 10 ? pick(["shipped", "delivered", "ready"]) : pick(statuses);
    const paid = status !== "pending_payment" && status !== "cancelled";
    const paymentMethod = pick(["mercadopago", "mercadopago", "pix_manual"] as const);
    const createdAt = daysAgo(d, 9 + Math.floor(rand() * 10));
    const [order] = await db
      .insert(schema.orders)
      .values({
        number: num("PED", orderIdx),
        customerId: c.id,
        status,
        paymentStatus: paid ? "approved" : status === "cancelled" ? "cancelled" : "pending",
        paymentMethod,
        shippingMethod,
        subtotalCents: subtotal,
        shippingCents: shipping,
        totalCents: subtotal + shipping,
        customerName: c.name,
        customerEmail: c.email!,
        customerPhone: c.phone,
        shippingAddress: shippingMethod === "pickup" ? null : { recipient: c.name, street: "Rua das Flores", number: String(100 + orderIdx), district: "Centro", city: "São Paulo", state: "SP", zip: "01000-000" },
        paidAt: paid ? new Date(createdAt.getTime() + 3600_000 * (1 + rand() * 20)) : null,
        trackingCode: status === "shipped" || status === "delivered" ? (shippingMethod === "correios" ? `BR${String(100000000 + orderIdx * 7919).slice(0, 9)}BR` : null) : null,
        adminNotes: `${DEMO}pedido gerado pelo seed`,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    await db.insert(schema.orderItems).values(items.map((i) => ({ orderId: order.id, productId: i.productId, variantId: i.variantId, name: i.name, variantLabel: i.label, quantity: i.qty, unitPriceCents: i.unit, unitCostCents: i.cost, totalCents: i.unit * i.qty })));
    await db.insert(schema.orderEvents).values({ orderId: order.id, type: "created", message: `Pedido ${order.number} criado pelo site`, createdAt });
    if (paid) await db.insert(schema.orderEvents).values({ orderId: order.id, type: "payment", message: `Pagamento aprovado (${paymentMethod})`, createdAt: order.paidAt! });
    created.push({ order, items: items.map((i) => ({ productId: i.productId, qty: i.qty, costCents: i.cost, name: i.name })) });
  }
  console.log(`✔ ${created.length} pedidos (6 meses)`);

  // ---------- fornadas: uma por pedido pago antigo + reposições, com perdas e desperdício ----------
  let jobs = 0;
  for (const { order, items } of created) {
    if (order.paymentStatus !== "approved" || ["paid", "pending_payment"].includes(order.status)) continue;
    for (const it of items) {
      const p = products.find((x) => x.id === it.productId)!;
      const printer = pick(printers);
      const failed = rand() < 0.15 ? 1 : 0;
      const waste = Math.round(rand() * 12);
      const grams = p.materialGrams * it.qty;
      const finishedAt = new Date(order.paidAt!.getTime() + 86400_000 * (1 + rand() * 2));
      await db.insert(schema.printJobs).values({ title: `${DEMO}${order.number} · ${it.name}`, status: "done", orderId: order.id, productId: p.id, printerId: printer?.id, materialId: p.materialId, quantity: it.qty, producedQty: it.qty, failedQty: failed, wasteGrams: waste, estimatedMinutes: p.printMinutes * it.qty, actualMinutes: Math.round(p.printMinutes * it.qty * (0.95 + rand() * 0.2)), estimatedGrams: grams, actualGrams: grams, startedAt: new Date(finishedAt.getTime() - p.printMinutes * 60_000 * it.qty), finishedAt, createdAt: order.paidAt!, updatedAt: finishedAt });
      if (p.materialId) {
        await db.insert(schema.stockMovements).values({ materialId: p.materialId, deltaGrams: -grams, reason: "print", refType: "print_job", note: `${DEMO}${order.number}`, createdAt: finishedAt });
        if (failed || waste) await db.insert(schema.stockMovements).values({ materialId: p.materialId, deltaGrams: -(failed * p.materialGrams + waste), reason: "waste", refType: "print_job", note: `${DEMO}${order.number} · ${failed} perdida(s) + purga`, createdAt: finishedAt });
      }
      jobs++;
    }
  }
  // fila atual: alguns jobs enfileirados/imprimindo para pedidos pagos recentes
  for (const { order, items } of created.filter((c) => c.order.status === "paid" || c.order.status === "in_production")) {
    for (const it of items) {
      const p = products.find((x) => x.id === it.productId)!;
      await db.insert(schema.printJobs).values({ title: `${DEMO}${order.number} · ${it.name}`, status: order.status === "in_production" ? "printing" : "queued", orderId: order.id, productId: p.id, printerId: pick(printers)?.id, materialId: p.materialId, quantity: it.qty, estimatedMinutes: p.printMinutes * it.qty, estimatedGrams: p.materialGrams * it.qty, priority: order.status === "in_production" ? 1 : 0, startedAt: order.status === "in_production" ? daysAgo(0, 8) : null });
      jobs++;
    }
  }
  // reposições de estoque
  for (const p of stockProducts.slice(0, 3)) {
    await db.insert(schema.printJobs).values({ title: `${DEMO}Fornada · 10× ${p.name}`, status: "done", productId: p.id, printerId: pick(printers)?.id, materialId: p.materialId, quantity: 10, producedQty: 9, failedQty: 1, wasteGrams: 18, estimatedMinutes: p.printMinutes * 10, actualMinutes: p.printMinutes * 10 + 40, estimatedGrams: p.materialGrams * 10, actualGrams: p.materialGrams * 9, addsToStock: true, startedAt: daysAgo(12), finishedAt: daysAgo(11), createdAt: daysAgo(12) });
    jobs++;
  }
  // compras de filamento (entradas)
  for (const [i, m] of materials.slice(0, 3).entries()) {
    await db.insert(schema.stockMovements).values({ materialId: m.id, deltaGrams: 1000, reason: "purchase", unitCostCents: m.costPerKgCents, note: `${DEMO}compra mensal`, createdAt: daysAgo(40 + i * 30) });
    await db.insert(schema.expenses).values({ description: `${DEMO}Compra 1 kg ${m.name}`, category: "material", kind: "cogs", amountCents: m.costPerKgCents, date: daysAgo(40 + i * 30), supplier: m.supplier ?? "Loja de filamento" });
  }
  // deixa um filamento em baixa
  await db.update(schema.materials).set({ stockGrams: 120 }).where(eq(schema.materials.id, mat("TPU Amarelo").id));
  console.log(`✔ ${jobs} jobs de produção + movimentações`);

  // ---------- orçamentos ----------
  const quoteSeed: { title: string; status: schema.QuoteStatus; price: number; qty: number; d: number; desc: string }[] = [
    { title: "Topper de bolo Ana 5 anos", status: "quoted", price: 8900, qty: 1, d: 3, desc: "Tema unicórnio, rosa e lilás, 12 cm de altura, com nome e idade." },
    { title: "Suporte de parede para 3 headsets", status: "quoted", price: 15900, qty: 1, d: 6, desc: "Parede de drywall, headsets de ~350 g cada, cor preta." },
    { title: "Lembrancinhas casamento (60 un.)", status: "reviewing", price: 0, qty: 60, d: 2, desc: "Mini vaso com iniciais J&M, dourado ou branco, entrega em 5 semanas." },
    { title: "Engrenagem de reposição liquidificador", status: "new", price: 0, qty: 2, d: 1, desc: "Peça quebrada, foto anexa, 38 dentes, eixo 8 mm." },
    { title: "Placa de porta com nome do consultório", status: "approved", price: 12000, qty: 1, d: 12, desc: "Acrílico + relevo 3D, 30x10 cm." },
    { title: "Porta-canetas corporativo (25 un.)", status: "approved", price: 62500, qty: 25, d: 20, desc: "Logo em relevo, cor azul marinho." },
    { title: "Miniatura de casa (maquete)", status: "rejected", price: 45000, qty: 1, d: 30, desc: "Escala 1:100, 2 andares." },
    { title: "Organizador de gaveta sob medida", status: "quoted", price: 7400, qty: 2, d: 9, desc: "Gaveta 40x30x8 cm, 6 divisórias." },
  ];
  const quoteIds: string[] = [];
  for (const [i, q] of quoteSeed.entries()) {
    const c = custs[(i * 3) % custs.length];
    const createdAt = daysAgo(q.d);
    const [row] = await db.insert(schema.quotes).values({ number: num("ORC", i + 1), customerId: c.id, status: q.status, title: q.title, description: q.desc, quantity: q.qty, desiredMaterial: pick(["PLA", "PETG", ""]) || null, desiredColor: pick(["Preto", "Branco", "Rosa", "Lilás"]), estimatedGrams: 40 + Math.round(rand() * 80), estimatedMinutes: 90 + Math.round(rand() * 180), materialId: pick(materials).id, costCents: q.price ? Math.round(q.price * 0.35) : null, priceCents: q.price || null, validUntil: q.status === "quoted" ? daysAgo(-10) : null, adminNotes: `${DEMO}`, createdAt, updatedAt: createdAt }).returning();
    quoteIds.push(row.id);
    await db.insert(schema.quoteMessages).values({ quoteId: row.id, authorName: c.name, body: "Oi! Consegue me mandar uma prévia antes de imprimir?", createdAt: new Date(createdAt.getTime() + 3600_000) });
    if (q.price) await db.insert(schema.quoteMessages).values({ quoteId: row.id, authorName: "AHL Studio", body: `Orçamento enviado: R$ ${(q.price / 100).toFixed(2)} para ${q.qty} un.`, createdAt: new Date(createdAt.getTime() + 7200_000) });
  }
  // orçamentos aprovados viram pedidos pagos com item personalizado
  for (const [i, q] of quoteSeed.entries()) {
    if (q.status !== "approved") continue;
    const c = custs[(i * 3) % custs.length];
    orderIdx++;
    const paidAt = daysAgo(q.d - 2);
    const [o] = await db.insert(schema.orders).values({ number: num("PED", orderIdx), customerId: c.id, status: i % 2 ? "in_production" : "delivered", paymentStatus: "approved", paymentMethod: "mercadopago", shippingMethod: "pickup", subtotalCents: q.price, totalCents: q.price, customerName: c.name, customerEmail: c.email!, customerPhone: c.phone, adminNotes: `${DEMO}origem orçamento`, paidAt, createdAt: paidAt, updatedAt: paidAt }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, quoteId: quoteIds[i], name: `Personalizado: ${q.title}`, quantity: 1, unitPriceCents: q.price, unitCostCents: Math.round(q.price * 0.35), totalCents: q.price });
    await db.update(schema.quotes).set({ orderId: o.id }).where(eq(schema.quotes.id, quoteIds[i]));
  }
  console.log(`✔ ${quoteSeed.length} orçamentos`);

  // ---------- chamados ----------
  const ticketSeed = [
    { subject: "Peça chegou com a asa quebrada", category: "product", status: "open", body: "O dragão veio com a asa solta. Foto em anexo. Consigo troca?" },
    { subject: "Pedido ainda não chegou", category: "order", status: "pending", body: "O rastreio não atualiza há 5 dias." },
    { subject: "Quero mudar a cor do meu orçamento", category: "quote", status: "resolved", body: "Em vez de preto, pode ser azul marinho?" },
    { subject: "Nota fiscal do pedido", category: "payment", status: "closed", body: "Preciso da NF para reembolso na empresa." },
  ] as const;
  for (const [i, t] of ticketSeed.entries()) {
    const c = custs[i + 2];
    const createdAt = daysAgo(8 - i * 2);
    const [row] = await db.insert(schema.tickets).values({ number: num("CHM", i + 1), customerId: c.id, name: c.name, email: c.email!, subject: t.subject, category: t.category, status: t.status, priority: i === 0 ? 2 : 0, lastCustomerMessageAt: createdAt, createdAt, updatedAt: createdAt }).returning();
    await db.insert(schema.ticketMessages).values({ ticketId: row.id, authorName: c.name, body: t.body, fromAdmin: false, createdAt });
    if (t.status !== "open") await db.insert(schema.ticketMessages).values({ ticketId: row.id, authorName: "AHL Studio", body: "Oi! Já estamos cuidando disso. Te retorno até amanhã.", fromAdmin: true, createdAt: new Date(createdAt.getTime() + 5400_000) });
  }
  console.log(`✔ ${ticketSeed.length} chamados`);

  // ---------- despesas OPEX recorrentes + avulsas ----------
  const recurring = [
    { description: `${DEMO}Google Cloud Run + Artifact Registry`, category: "cloud", amountCents: 1900 },
    { description: `${DEMO}Turso (banco)`, category: "cloud", amountCents: 0 },
    { description: `${DEMO}Domínio + e-mail (Google Workspace)`, category: "software", amountCents: 3500 },
    { description: `${DEMO}Canva Pro + assinatura de modelos 3D`, category: "software", amountCents: 8900 },
    { description: `${DEMO}Energia elétrica (parcela do studio)`, category: "energy", amountCents: 18000 },
    { description: `${DEMO}Aluguel (espaço do studio)`, category: "rent", amountCents: 60000 },
    { description: `${DEMO}Pró-labore`, category: "payroll", amountCents: 250000 },
    { description: `${DEMO}Contador (MEI/Simples)`, category: "other", amountCents: 9900 },
    { description: `${DEMO}Impulsionamento Instagram`, category: "marketing", amountCents: 15000 },
  ] as const;
  for (const e of recurring) {
    if (!e.amountCents) continue;
    await db.insert(schema.expenses).values({ ...e, kind: e.category === "energy" ? "cogs" : "opex", recurring: true, date: daysAgo(170) });
  }
  const oneOff = [
    { description: `${DEMO}Embalagens e etiquetas`, category: "supplies", kind: "cogs", amountCents: 12400, d: 25 },
    { description: `${DEMO}Manutenção: troca de hotend`, category: "maintenance", kind: "opex", amountCents: 18900, d: 45 },
    { description: `${DEMO}Frete de envio (Correios) do mês`, category: "shipping", kind: "cogs", amountCents: 9800, d: 15 },
    { description: `${DEMO}Stand na feira de artesanato`, category: "marketing", kind: "opex", amountCents: 35000, d: 60 },
    { description: `${DEMO}Paquímetro digital + espátulas`, category: "equipment", kind: "opex", amountCents: 14900, d: 90 },
  ] as const;
  for (const e of oneOff) await db.insert(schema.expenses).values({ description: e.description, category: e.category, kind: e.kind, amountCents: e.amountCents, date: daysAgo(e.d) });
  console.log(`✔ ${recurring.length + oneOff.length} despesas`);

  // ---------- CAPEX ----------
  await db.insert(schema.assets).values([
    { name: `${DEMO}Bambu Lab A1 mini`, category: "machine", amountCents: 249900, purchaseDate: daysAgo(200), usefulLifeMonths: 36, salvageCents: 30000, printerId: printers[1]?.id ?? null },
    { name: `${DEMO}Creality Ender 3 V3 SE`, category: "machine", amountCents: 129900, purchaseDate: daysAgo(400), usefulLifeMonths: 36, salvageCents: 15000, printerId: printers[0]?.id ?? null },
    { name: `${DEMO}Notebook (fatiamento e loja)`, category: "computer", amountCents: 420000, purchaseDate: daysAgo(300), usefulLifeMonths: 48, salvageCents: 80000 },
    { name: `${DEMO}Bancada + estante`, category: "furniture", amountCents: 89000, purchaseDate: daysAgo(180), usefulLifeMonths: 60 },
  ]);
  console.log("✔ 4 ativos (CAPEX)");

  // ---------- receitas fora do e-commerce ----------
  await db.insert(schema.manualRevenues).values([
    { description: `${DEMO}Feira de artesanato — 14 peças`, line: "event", amountCents: 68000, costCents: 21000, date: daysAgo(58) },
    { description: `${DEMO}Modelagem 3D para arquiteto`, line: "service", amountCents: 45000, costCents: 0, date: daysAgo(33) },
    { description: `${DEMO}Lote de 30 chaveiros para loja parceira`, line: "wholesale", amountCents: 33000, costCents: 9000, date: daysAgo(12) },
  ]);
  console.log("✔ 3 receitas manuais");

  console.log("\nPronto! Abra /admin, /admin/financeiro, /admin/forecast, /admin/relatorios e /admin/almoxarifado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
