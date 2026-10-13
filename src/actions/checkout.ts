"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { addresses, customers, orderEvents, orderItems, orders, products, productVariants, quoteMessages, quotes, users, type ShippingAddress } from "@/db/schema";
import { auth } from "@/lib/auth";
import { writeCartLines } from "@/lib/cart";
import { createPreference, isMercadoPagoEnabled } from "@/lib/mercadopago";
import { recordConsent, TERMS_VERSION } from "@/lib/security";
import { normalizeCep } from "@/lib/shipping";
import { quoteCart } from "@/lib/shipping-quote";
import { writeShippingPref } from "@/lib/shipping-pref";
import { humanNumber } from "@/lib/utils";
import { audit } from "@/lib/audit";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import type { ActionState } from "@/components/ui/form-message";

const schema = z.object({
  name: z.string().min(2, "Informe seu nome").max(120),
  email: z.email("E-mail inválido"),
  phone: z.string().min(8, "Informe um telefone/WhatsApp").max(30),
  shippingOptionId: z.string().min(1, "Escolha uma forma de entrega").max(80),
  addressId: z.string().max(60).optional(),
  saveAddress: z.string().optional(),
  addressLabel: z.string().max(40).optional(),
  reference: z.string().max(200).optional(),
  street: z.string().max(200).optional(),
  number: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  zip: z.string().max(12).optional(),
  notes: z.string().max(1000).optional(),
  acceptTerms: z.literal("on", { error: "É preciso aceitar os Termos de Uso e a Política de Privacidade" }),
});

export async function placeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  try {
    await assertRateLimit("checkout:ip", 10, 60 * 60_000, { byIp: true });
  } catch (err) {
    if (err instanceof RateLimitError) return { error: "Muitas tentativas de checkout. Aguarde alguns minutos." };
    throw err;
  }

  const session = await auth();
  const email = d.email.toLowerCase();

  // Frete: recota no servidor para o CEP informado e usa o preço da opção escolhida (nunca o do formulário)
  const cep = normalizeCep(d.zip);
  const { quote, cart } = await quoteCart(cep ?? null);
  if (cart.items.length === 0) return { error: "Seu carrinho está vazio" };
  const option = quote.options.find((o) => o.id === d.shippingOptionId);
  if (!option) return { error: "A opção de frete mudou. Recalcule o frete e escolha novamente." };
  if (option.method !== "pickup" && !cep) return { error: "Informe o CEP de entrega e calcule o frete" };

  let address: ShippingAddress | null = null;
  let savedAddressId: string | null = null;
  if (option.method !== "pickup") {
    if (d.addressId && session?.user?.id) {
      const a = await db.query.addresses.findFirst({ where: and(eq(addresses.id, d.addressId), eq(addresses.userId, session.user.id)) });
      if (!a) return { error: "Endereço não encontrado na sua conta" };
      if (a.zip !== cep) return { error: "O CEP do endereço escolhido é diferente do CEP cotado. Recalcule o frete." };
      address = { recipient: a.recipient ?? d.name, street: a.street, number: a.number, complement: a.complement ?? undefined, district: a.district ?? undefined, city: a.city, state: a.state, zip: a.zip, reference: a.reference ?? undefined };
      savedAddressId = a.id;
    } else {
      if (!d.street || !d.number || !d.city || !d.state) return { error: "Preencha o endereço de entrega completo" };
      address = { recipient: d.name, street: d.street, number: d.number, complement: d.complement || undefined, district: d.district || undefined, city: d.city, state: d.state.toUpperCase(), zip: cep!, reference: d.reference || undefined };
    }
  }

  // Itens personalizados só podem ser comprados pelo dono logado (getCart já filtra) e com o mesmo e-mail
  const customItems = cart.items.filter((i) => i.isCustom);
  if (customItems.length && (!session?.user || session.user.email?.toLowerCase() !== email)) {
    return { error: "Para comprar um item personalizado, use o e-mail da sua conta" };
  }

  // CRM: encontra ou cria o cliente
  let customer = await db.query.customers.findFirst({ where: eq(customers.email, email) });
  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({ name: d.name, email, phone: d.phone, stage: "active", source: "site", userId: session?.user?.id ?? null })
      .returning();
  } else if (customer.stage === "lead") {
    await db.update(customers).set({ stage: "active", phone: customer.phone ?? d.phone }).where(eq(customers.id, customer.id));
  }

  const shippingCents = option.priceCents;
  const totalCents = cart.subtotalCents + shippingCents;
  const useMP = isMercadoPagoEnabled();

  const [order] = await db
    .insert(orders)
    .values({
      number: humanNumber("PED"),
      customerId: customer.id,
      userId: session?.user?.id ?? null,
      status: "pending_payment",
      paymentStatus: "pending",
      paymentMethod: useMP ? "mercadopago" : "pix_manual",
      shippingMethod: option.method,
      shippingService: option.name,
      shippingCarrier: option.carrier,
      shippingDaysMin: option.daysMin,
      shippingDaysMax: option.daysMax,
      shippingZip: cep,
      shippingCostCents: option.costCents ?? 0,
      productionDays: quote.productionDays,
      subtotalCents: cart.subtotalCents,
      shippingCents,
      totalCents,
      customerName: d.name,
      customerEmail: email,
      customerPhone: d.phone,
      shippingAddress: address,
      customerNotes: d.notes || null,
    })
    .returning();

  const items = await db
    .insert(orderItems)
    .values(
      cart.items.map((i) => ({
        orderId: order.id,
        productId: i.productId ?? null,
        variantId: i.variantId ?? null,
        quoteId: i.quoteId ?? null,
        name: i.name,
        variantLabel: i.variantLabel,
        customization: i.customization ?? null,
        quantity: i.quantity,
        // o que falta em estoque vira job na fila quando o pedido for pago (personalizado: tudo)
        toProduceQty: i.isCustom ? i.quantity : Math.max(0, i.quantity - Math.max(0, i.maxQty)),
        unitPriceCents: i.unitPriceCents,
        unitCostCents: i.unitCostCents,
        totalCents: i.totalCents,
      })),
    )
    .returning();

  // Reserva estoque dos itens de catálogo (pode ficar negativo = produzir sob demanda)
  for (const i of cart.items) {
    if (i.isCustom || !i.productId) continue;
    if (i.variantId) {
      const v = await db.query.productVariants.findFirst({ where: eq(productVariants.id, i.variantId) });
      if (v) await db.update(productVariants).set({ stockQty: v.stockQty - i.quantity }).where(eq(productVariants.id, v.id));
    }
    const p = await db.query.products.findFirst({ where: eq(products.id, i.productId) });
    if (p) await db.update(products).set({ stockQty: p.stockQty - i.quantity }).where(eq(products.id, p.id));
  }

  // Orçamentos comprados viram "aprovados" e apontam para o pedido
  const quoteIds = customItems.map((i) => i.quoteId!).filter(Boolean);
  if (quoteIds.length) {
    await db.update(quotes).set({ status: "approved", orderId: order.id }).where(inArray(quotes.id, quoteIds));
    for (const qid of quoteIds) {
      await db.insert(quoteMessages).values({ quoteId: qid, body: `Orçamento aprovado pelo cliente. Pedido ${order.number} gerado.`, authorName: "Sistema" });
    }
  }

  await db.insert(orderEvents).values({ orderId: order.id, type: "created", message: `Pedido ${order.number} criado pelo site` });
  await recordConsent({ type: "terms", version: TERMS_VERSION, email, userId: session?.user?.id, meta: { source: "checkout", orderId: order.id } });

  // Conta do cliente: guarda o endereço novo (se pediu) e completa o WhatsApp se ainda não tinha
  if (session?.user?.id) {
    if (address && !savedAddressId && d.saveAddress === "on") {
      const mine = await db.query.addresses.findMany({ where: eq(addresses.userId, session.user.id) });
      if (mine.length < 10) await db.insert(addresses).values({ userId: session.user.id, label: d.addressLabel?.trim() || "Casa", recipient: address.recipient, phone: d.phone, street: address.street, number: address.number, complement: address.complement ?? null, district: address.district ?? null, city: address.city, state: address.state, zip: address.zip, reference: address.reference ?? null, isDefault: mine.length === 0 });
    }
    const u = await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { phone: true } });
    if (u && !u.phone) await db.update(users).set({ phone: d.phone }).where(eq(users.id, session.user.id));
  }

  await writeCartLines([]);
  await writeShippingPref({ cep: null, optionId: null });
  await audit({ action: "order.created", channel: "customer", entityType: "order", entityId: order.id, summary: `Pedido ${order.number} · R$ ${(totalCents / 100).toFixed(2)} · ${cart.items.length} item(ns)`, actor: { id: session?.user?.id, email, role: "customer" }, meta: { totalCents, shippingMethod: option.method, shippingService: option.name, shippingCents, paymentMethod: order.paymentMethod, customItems: quoteIds.length } });

  const orderUrl = `/pedido/${order.id}?t=${order.accessToken ?? ""}`;

  if (useMP) {
    try {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host");
      const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
      const pref = await createPreference(order, items, host ? `${proto}://${host}` : undefined);
      await db.update(orders).set({ mpPreferenceId: pref.preferenceId }).where(eq(orders.id, order.id));
      redirect(pref.initPoint);
    } catch (err) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      console.error("Mercado Pago preference error", err);
      await audit({ action: "payment.preference_failed", channel: "system", level: "error", entityType: "order", entityId: order.id, summary: `Falha ao criar preferência MP para ${order.number}`, meta: { error: String((err as Error)?.message ?? err) }, actor: {} });
      await db.update(orders).set({ paymentMethod: "pix_manual" }).where(eq(orders.id, order.id));
      await db.insert(orderEvents).values({ orderId: order.id, type: "payment", message: "Falha ao criar cobrança no Mercado Pago; pedido segue com PIX manual" });
    }
  }
  redirect(orderUrl);
}
